// The laptop/big-screen flow: setup -> dance -> reveal -> battle host.
// Phase 3 adds: song selection (typed search / Surprise Me / mic), rhythm reactivity (beat
// pulses into the painter), and genre pre-tint on song pick. Song stays a BACKDROP signal only
// — see plan's core principle: culture/mood/color come from the PERSON, never the song.
import { useEffect, useRef, useState } from 'react';
import { getHealth } from '../net/api.ts';
import { WsClient } from '../net/ws.ts';
import { useAppStore } from '../state/store.ts';
import { startCamera, stopCamera } from '../capture/camera.ts';
import { initPose, isPoseReady, detectPose } from '../capture/pose.ts';
import { drawSkeleton } from '../capture/skeletonOverlay.ts';
import { MotionTapeRecorder } from '../capture/motionTape.ts';
import { FeatureTracker } from '../capture/features.ts';
import { LivePainter } from '../art/livePainter.ts';
import { replayTape } from '../art/hiResReplay.ts';
import { SongPicker } from './SongPicker.tsx';
import { createPreviewSource, createMicSource, type AudioSource } from '../audio/engine.ts';
import { BeatDetector } from '../audio/beats.ts';
import { analyzePreviewBpm } from '../audio/preview.ts';
import { getGenrePreset } from '@shared/palettes.ts';
import { KeyframeCapture } from '../capture/keyframes.ts';
import { analyzeQuick, analyzeFull, generatePainting, createGalleryEntry, uploadGalleryArtifact, type AnalysisHints } from '../net/api.ts';
import { composePoster, canvasToBlob } from '../poster/composePoster.ts';
import { applyPalette } from './theme.ts';
import { computeStats } from '../capture/stats.ts';
import { RevealFlow, type RevealStage } from './RevealFlow.tsx';
import { SculptureView } from '../sculpture/SculptureView.tsx';
import type { FrameFeatures } from '../capture/features.ts';
import type { DanceStats, MotionTape, SongInfo, VisionAnalysis } from '@shared/types.ts';

function energyWordFrom(e: number): string {
  if (e < 0.25) return 'suave';
  if (e < 0.5) return 'fluida';
  if (e < 0.75) return 'vigorosa';
  return 'explosiva';
}
function smoothnessWordFrom(s: number): string {
  return s > 0.55 ? 'fluida y continua' : 'angular y entrecortada';
}

const CANVAS_W = 1280;
const CANVAS_H = 720;
const DEFAULT_PALETTE = ['#1a1025', '#3d2b56', '#a13d63', '#e8615a', '#f5b642', '#f2e5c8'];

export function StageScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const sparkleCanvasRef = useRef<HTMLCanvasElement>(null);

  const [apiOk, setApiOk] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [poseStatus, setPoseStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fps, setFps] = useState(0);
  const [dancing, setDancing] = useState(false);
  const [tape, setTape] = useState<MotionTape | null>(null);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [song, setSong] = useState<SongInfo | null>(null);
  const [micMode, setMicMode] = useState(false);
  const [micHint, setMicHint] = useState('');
  const [bpm, setBpm] = useState(0);
  const [analysis, setAnalysis] = useState<VisionAnalysis | null>(null);
  const [revealStage, setRevealStage] = useState<RevealStage | null>(null);
  const [danceStats, setDanceStats] = useState<DanceStats | null>(null);
  const [paintingBase64, setPaintingBase64] = useState<string | null>(null);
  const paintingUrl = paintingBase64 ? `data:image/png;base64,${paintingBase64}` : null;
  const [usingFallbackPainting, setUsingFallbackPainting] = useState(false);
  const [dancerName, setDancerName] = useState('');
  const [galleryState, setGalleryState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const sculptureSnapshotRef = useRef<(() => string | null) | null>(null);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  const recorderRef = useRef<MotionTapeRecorder | null>(null);
  const trackerRef = useRef<FeatureTracker>(new FeatureTracker());
  const painterRef = useRef<LivePainter | null>(null);
  const dancingRef = useRef(false);
  const audioSourceRef = useRef<AudioSource | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const beatDetectorRef = useRef<BeatDetector | null>(null);
  const keyframeCaptureRef = useRef(new KeyframeCapture());
  const latestFeaturesRef = useRef<FrameFeatures | null>(null);
  const quickFiredRef = useRef(false);
  const danceIdRef = useRef('');
  const songRef = useRef<SongInfo | null>(null);
  const bpmRef = useRef(0);
  const micHintRef = useRef('');
  songRef.current = song;
  bpmRef.current = bpm;
  micHintRef.current = micHint;

  function buildHints(): AnalysisHints {
    return {
      // In mic mode there's no song metadata — the free-text "what's playing" field (if the
      // user bothered to fill it in) is the only substitute, still just a minor hint.
      songTitle: songRef.current?.title ?? (micHintRef.current || undefined),
      artist: songRef.current?.artist,
      genre: songRef.current?.genre,
      bpm: bpmRef.current || undefined,
      energyWord: energyWordFrom(latestFeaturesRef.current?.kineticEnergy ?? 0),
      smoothnessWord: smoothnessWordFrom(latestFeaturesRef.current?.smoothness ?? 1),
    };
  }

  useEffect(() => {
    getHealth().then(() => setApiOk('ok')).catch(() => setApiOk('fail'));
    const client = new WsClient();
    const offConn = client.onConnectionChange(setWsConnected);
    client.connect();
    client.send({ type: 'join', session: 'DIAG', role: 'host' });
    return () => { offConn(); client.close(); };
  }, [setWsConnected]);

  useEffect(() => {
    let raf = 0;
    let stream: MediaStream | null = null;
    let cancelled = false;
    let frameCount = 0;
    let fpsWindowStart = performance.now();
    let lastTickMs = performance.now();

    async function setup() {
      const video = videoRef.current;
      const skeletonCanvas = skeletonCanvasRef.current;
      const paintCanvas = paintCanvasRef.current;
      const sparkleCanvas = sparkleCanvasRef.current;
      if (!video || !skeletonCanvas || !paintCanvas || !sparkleCanvas) return;

      try {
        stream = await startCamera(video);
      } catch (err) {
        console.error('[camera] failed to start', err);
        return;
      }

      try {
        await initPose();
        if (cancelled) return;
        setPoseStatus('ready');
      } catch (err) {
        console.error('[pose] init failed', err);
        setPoseStatus('error');
        return;
      }

      painterRef.current = new LivePainter(paintCanvas, sparkleCanvas, CANVAS_W, CANVAS_H, Date.now() | 0);
      const skeletonCtx = skeletonCanvas.getContext('2d')!;

      function loop() {
        if (cancelled || !video) return;
        const nowMs = performance.now();
        const dtMs = nowMs - lastTickMs;
        lastTickMs = nowMs;

        skeletonCanvas.width = video.videoWidth || 320;
        skeletonCanvas.height = video.videoHeight || 180;

        if (isPoseReady()) {
          const result = detectPose(video);
          if (result && result.landmarks[0]) {
            drawSkeleton(skeletonCtx, result.landmarks[0], skeletonCanvas.width, skeletonCanvas.height);

            if (dancingRef.current && recorderRef.current && painterRef.current) {
              const frame = recorderRef.current.pushPose(result);
              if (frame) {
                const features = trackerRef.current.update(frame);
                latestFeaturesRef.current = features;
                recorderRef.current.pushEnergy(features.kineticEnergy);
                painterRef.current.onFrame(frame, features);
              }
            }
          }
        }

        // Keyframe capture + Stage A "it's watching you" mid-dance quick analysis (plan §E).
        if (dancingRef.current && recorderRef.current) {
          const elapsed = recorderRef.current.elapsedMs();
          keyframeCaptureRef.current.maybeCapture(video, elapsed, latestFeaturesRef.current?.kineticEnergy ?? 0);

          if (!quickFiredRef.current && elapsed >= 7000) {
            quickFiredRef.current = true;
            const kf = keyframeCaptureRef.current.latest();
            if (kf) {
              analyzeQuick(danceIdRef.current, kf.base64, buildHints())
                .then((result) => {
                  setAnalysis(result);
                  applyPalette(result.colorPalette);
                  painterRef.current?.setPalette(result.colorPalette);
                })
                .catch((err) => console.warn('[analyze] quick failed', err));
            }
          }
        }

        // Beat pulses are rhythm backdrop only (never drive culture/mood) — see plan principle.
        if (beatDetectorRef.current) {
          const isBeat = beatDetectorRef.current.tick(nowMs);
          if (isBeat) {
            const liveBpm = beatDetectorRef.current.estimateBpm();
            if (liveBpm > 0) setBpm((prev) => prev || liveBpm);
            if (dancingRef.current && recorderRef.current && painterRef.current) {
              painterRef.current.pulseBeat(recorderRef.current.elapsedMs());
              recorderRef.current.pushBeat();
            }
          }
        }

        painterRef.current?.tick(nowMs, dtMs);

        frameCount++;
        if (nowMs - fpsWindowStart >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          fpsWindowStart = nowMs;
        }

        raf = requestAnimationFrame(loop);
      }
      loop();
    }

    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stopCamera(stream);
      audioSourceRef.current?.stop();
    };
  }, []);

  function stopAudio() {
    audioSourceRef.current?.stop();
    audioSourceRef.current = null;
    audioElRef.current = null;
    beatDetectorRef.current = null;
  }

  async function handleSelectSong(selected: SongInfo) {
    stopAudio();
    setSong(selected);
    setMicMode(false);
    setBpm(0);

    painterRef.current?.setPalette(getGenrePreset(selected.genre).colorPalette);

    if (!selected.previewUrl) return;
    const { source, audioEl } = createPreviewSource(selected.previewUrl);
    audioSourceRef.current = source;
    audioElRef.current = audioEl;
    beatDetectorRef.current = new BeatDetector(source.analyser);
    try {
      await audioEl.play();
    } catch (err) {
      console.warn('[audio] preview autoplay blocked, will require another click', err);
    }

    analyzePreviewBpm(selected.previewUrl, source.ctx).then((result) => {
      if (result && result.bpm > 0) setBpm(result.bpm);
    });
  }

  async function handleMicMode() {
    stopAudio();
    setSong(null);
    setMicMode(true);
    setBpm(0);
    try {
      const source = await createMicSource();
      audioSourceRef.current = source;
      beatDetectorRef.current = new BeatDetector(source.analyser);
    } catch (err) {
      console.error('[audio] mic access failed', err);
      setMicMode(false);
    }
  }

  function handleChangeSong() {
    stopAudio();
    setSong(null);
    setMicMode(false);
    setMicHint('');
    setBpm(0);
  }

  function handleStart() {
    const recorder = new MotionTapeRecorder('session');
    recorder.start();
    recorderRef.current = recorder;
    trackerRef.current = new FeatureTracker();
    painterRef.current?.reset();
    painterRef.current?.paintWash();
    keyframeCaptureRef.current.reset();
    quickFiredRef.current = false;
    danceIdRef.current = crypto.randomUUID();
    setAnalysis(null);
    setTape(null);
    setReplayUrl(null);
    setRevealStage(null);
    setDanceStats(null);
    setPaintingBase64(null);
    setGalleryState('idle');
    setUsingFallbackPainting(false);
    dancingRef.current = true;
    setDancing(true);
  }

  async function handleStop() {
    dancingRef.current = false;
    setDancing(false);
    audioElRef.current?.pause(); // "Terminar" must actually stop the music
    const finished = recorderRef.current?.stop(bpm) ?? null;
    setTape(finished);
    if (!finished || finished.frames.length === 0) return;

    const stats = computeStats(finished);
    setDanceStats(stats);
    setRevealStage('analyzing');

    // Stage B: authoritative full-dance analysis (drives final theme + reveal palette + the
    // Gemini prompt). Falls back to a neutral analysis only if the request itself fails
    // (analyzeVision on the server never throws — it has its own genre-preset fallback ladder).
    const frames = keyframeCaptureRef.current.pickForFullAnalysis(8).map((f) => f.base64);
    let finalAnalysis: VisionAnalysis;
    try {
      finalAnalysis = frames.length > 0
        ? await analyzeFull(danceIdRef.current, frames, buildHints())
        : { culture: 'universal', danceStyle: 'libre', mood: 'energético', colorPalette: DEFAULT_PALETTE, artStyleReferences: ['abstracto'], perceivedExperience: 'pura energía en movimiento', movementKeywords: ['libre'], fromVision: false };
    } catch (err) {
      console.warn('[analyze] full failed, using neutral fallback', err);
      finalAnalysis = { culture: 'universal', danceStyle: 'libre', mood: 'energético', colorPalette: DEFAULT_PALETTE, artStyleReferences: ['abstracto'], perceivedExperience: 'pura energía en movimiento', movementKeywords: ['libre'], fromVision: false };
    }
    setAnalysis(finalAnalysis);
    applyPalette(finalAnalysis.colorPalette);
    painterRef.current?.setPalette(finalAnalysis.colorPalette);

    // Deterministic hi-res replay — always available, doubles as the Gemini input image.
    const replay = replayTape(finished, finalAnalysis.colorPalette, 2048, 2560);
    const replayBase64 = replay.toPngBase64();

    setRevealStage('painting');
    try {
      const result = await generatePainting(danceIdRef.current, finalAnalysis, stats, replayBase64);
      if (result.fallback || !result.imageBase64) {
        setPaintingBase64(replayBase64);
        setUsingFallbackPainting(true);
      } else {
        setPaintingBase64(result.imageBase64);
        setUsingFallbackPainting(false);
      }
    } catch (err) {
      console.warn('[painting] generation failed, using hi-res replay fallback', err);
      setPaintingBase64(replayBase64);
      setUsingFallbackPainting(true);
    }
    setRevealStage('done');
  }

  async function handleSaveToGallery() {
    if (!analysis || !danceStats || !paintingUrl || !dancerName.trim()) return;
    setGalleryState('saving');
    try {
      const entry = await createGalleryEntry(dancerName.trim(), song, analysis, danceStats);

      const sculptureSnapshot = sculptureSnapshotRef.current?.() ?? null;
      const poster = await composePoster({
        paintingUrl,
        analysis,
        song,
        stats: danceStats,
        dancerName: dancerName.trim(),
        sculptureSnapshotUrl: sculptureSnapshot,
      });
      const posterBlob = await canvasToBlob(poster);
      const posterBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(posterBlob);
      });

      await Promise.all([
        uploadGalleryArtifact(entry.id, 'painting.png', paintingUrl.split(',')[1] ?? ''),
        uploadGalleryArtifact(entry.id, 'poster.png', posterBase64),
      ]);

      setGalleryState('saved');
    } catch (err) {
      console.error('[gallery] save failed', err);
      setGalleryState('error');
    }
  }

  async function handleReplay() {
    if (!tape) return;
    setReplaying(true);
    try {
      // Vision-analysis palette is authoritative (from the person, per plan's core principle);
      // genre preset is a pre-analysis fallback only.
      const palette = analysis?.colorPalette ?? (song ? getGenrePreset(song.genre).colorPalette : DEFAULT_PALETTE);
      const result = replayTape(tape, palette, 2048, 2560);
      const blob = await result.toBlob();
      setReplayUrl(URL.createObjectURL(blob));
    } finally {
      setReplaying(false);
    }
  }

  const readyToDance = !!song || micMode;

  return (
    <main style={{ minHeight: '100vh', paddingBottom: '3rem' }}>
      <header style={{ padding: '2rem 1.5rem 0.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600, background: 'linear-gradient(135deg, var(--c4), var(--c5))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Danza
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-dim)', fontSize: 14 }}>Baila. Exprésate. Conviértete en arte.</p>
      </header>

      {!readyToDance && !dancing && !tape && (
        <div style={{ margin: '1.5rem auto 1rem', maxWidth: 520, padding: '0 1rem' }}>
          <SongPicker onSelect={handleSelectSong} onMicMode={handleMicMode} />
        </div>
      )}

      {readyToDance && (
        <div style={{ textAlign: 'center', margin: '1rem auto 0.75rem', maxWidth: 480 }}>
          <div className="card" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0.6rem 1.25rem' }}>
            {song ? (
              <p style={{ margin: 0, fontSize: 15 }}>
                🎵 <strong>{song.title}</strong> — {song.artist} {bpm > 0 && <span style={{ color: 'var(--accent)' }}>· {bpm} BPM</span>}{' '}
                {!dancing && <button onClick={handleChangeSong} style={{ marginLeft: 6, fontSize: 12, padding: '2px 10px', borderRadius: 999 }}>cambiar</button>}
              </p>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 15 }}>
                  🎤 Modo micrófono {bpm > 0 && <span style={{ color: 'var(--accent)' }}>· {bpm} BPM</span>}{' '}
                  {!dancing && <button onClick={handleChangeSong} style={{ marginLeft: 6, fontSize: 12, padding: '2px 10px', borderRadius: 999 }}>cambiar</button>}
                </p>
                {!dancing && (
                  <input
                    value={micHint}
                    onChange={(e) => setMicHint(e.target.value)}
                    placeholder="¿Qué canción está sonando? (opcional)"
                    style={{ padding: '0.4rem 0.9rem', borderRadius: 999, fontSize: 13, width: 280 }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Controls placed above the canvas — always visible without scrolling. */}
      <div style={{ textAlign: 'center', margin: '1rem 0' }}>
        {!dancing ? (
          <button className="btn-primary" onClick={handleStart} disabled={!readyToDance} style={{ fontSize: 19, padding: '0.9rem 2.75rem', borderRadius: 999 }}>
            ▶ Empezar a bailar
          </button>
        ) : (
          <button className="btn-primary" onClick={handleStop} style={{ fontSize: 19, padding: '0.9rem 2.75rem', borderRadius: 999 }}>
            ■ Terminar
          </button>
        )}
      </div>

      {tape && (
        <p style={{ textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12, margin: '0 0 0.5rem' }}>
          {tape.frames.length} frames · {(tape.durationMs / 1000).toFixed(1)}s · {tape.beats.length} beats · {tape.bpm} BPM
        </p>
      )}

      {dancing && !analysis && (
        <p style={{ textAlign: 'center', color: 'var(--ink-dim)', fontSize: 13, margin: '0 0 0.75rem', animation: 'pulse-fade 2s ease-in-out infinite' }}>
          👁️ observando tu movimiento…
        </p>
      )}

      <div
        className="card"
        style={{ position: 'relative', width: '100%', maxWidth: 720, aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, margin: '0 auto', background: '#000', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
      >
        <canvas ref={paintCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <canvas ref={sparkleCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

        <div style={{ position: 'absolute', top: 12, right: 12, width: '18%', minWidth: 100, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.25)', boxShadow: 'var(--shadow-md)' }}>
          <video ref={videoRef} style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }} />
          <canvas ref={skeletonCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>

        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', padding: '3px 10px', borderRadius: 999, fontSize: 12, color: 'var(--ink-dim)' }}>
          {fps} fps
        </div>
      </div>

      {revealStage && (
        <RevealFlow
          stage={revealStage}
          analysis={analysis}
          stats={danceStats}
          paintingUrl={paintingUrl}
          usingFallback={usingFallbackPainting}
        />
      )}

      {paintingUrl && revealStage === 'done' && (
        <div style={{ textAlign: 'center', margin: '0.5rem 0 1.5rem' }}>
          <a href={paintingUrl} download="obra.png" style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>⬇ Descargar obra</a>
        </div>
      )}

      {revealStage === 'done' && tape && (
        <SculptureView
          tape={tape}
          palette={analysis?.colorPalette ?? DEFAULT_PALETTE}
          onSnapshotReady={(getSnapshot) => { sculptureSnapshotRef.current = getSnapshot; }}
        />
      )}

      {revealStage === 'done' && analysis && danceStats && (
        <div className="card" style={{ textAlign: 'center', margin: '1rem auto 2rem', padding: '1.25rem 1.5rem', maxWidth: 420 }}>
          {galleryState !== 'saved' ? (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-dim)' }}>Guarda tu obra en la galería de la fiesta</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <input
                  value={dancerName}
                  onChange={(e) => setDancerName(e.target.value)}
                  placeholder="Tu nombre"
                  style={{ padding: '0.5rem 1rem', borderRadius: 999, fontSize: 14 }}
                />
                <button
                  className="btn-primary"
                  onClick={handleSaveToGallery}
                  disabled={!dancerName.trim() || galleryState === 'saving'}
                  style={{ padding: '0.5rem 1.5rem', borderRadius: 999 }}
                >
                  {galleryState === 'saving' ? 'Guardando…' : '💾 Guardar'}
                </button>
              </div>
              {galleryState === 'error' && <p style={{ color: 'var(--c4)', fontSize: 13, marginTop: 8 }}>Error al guardar — intenta de nuevo.</p>}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 15 }}>✅ Guardado en la galería como "<strong>{dancerName}</strong>"</p>
          )}
        </div>
      )}

      <details style={{ maxWidth: 480, margin: '2rem auto 0', textAlign: 'center' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 12 }}>herramientas de desarrollo</summary>
        <div style={{ marginTop: 10 }}>
          {tape && !dancing && (
            <button onClick={handleReplay} disabled={replaying} style={{ fontSize: 13, padding: '0.4rem 1rem', borderRadius: 999 }}>
              {replaying ? 'Generando…' : '🔁 Replay hi-res'}
            </button>
          )}
          {replayUrl && (
            <div style={{ marginTop: 10 }}>
              <img src={replayUrl} alt="hi-res replay (dev)" style={{ maxWidth: 220, borderRadius: 8, border: '1px solid var(--border)' }} />
              <div><a href={replayUrl} download="replay.png" style={{ color: 'var(--accent)', fontSize: 12 }}>Descargar PNG</a></div>
            </div>
          )}
          <p style={{ color: 'var(--ink-faint)', fontSize: 11, marginTop: 10 }}>
            API: {apiOk === 'checking' ? '…' : apiOk === 'ok' ? '✅' : '❌'} ·{' '}
            WS: {wsConnected ? '✅' : '⏳'} ·{' '}
            Pose: {poseStatus === 'loading' ? '…' : poseStatus === 'ready' ? '✅' : '❌'}
          </p>
        </div>
      </details>

      <style>{`
        @keyframes pulse-fade {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </main>
  );
}
