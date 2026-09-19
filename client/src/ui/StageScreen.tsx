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
import type { MotionTape, SongInfo } from '@shared/types.ts';

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
  const [bpm, setBpm] = useState(0);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  const recorderRef = useRef<MotionTapeRecorder | null>(null);
  const trackerRef = useRef<FeatureTracker>(new FeatureTracker());
  const painterRef = useRef<LivePainter | null>(null);
  const dancingRef = useRef(false);
  const audioSourceRef = useRef<AudioSource | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const beatDetectorRef = useRef<BeatDetector | null>(null);

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
                painterRef.current.onFrame(frame, features);
              }
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
    setBpm(0);
  }

  function handleStart() {
    const recorder = new MotionTapeRecorder('session');
    recorder.start();
    recorderRef.current = recorder;
    trackerRef.current = new FeatureTracker();
    painterRef.current?.reset();
    setTape(null);
    setReplayUrl(null);
    dancingRef.current = true;
    setDancing(true);
  }

  function handleStop() {
    dancingRef.current = false;
    setDancing(false);
    audioElRef.current?.pause(); // "Terminar" must actually stop the music
    const finished = recorderRef.current?.stop(bpm) ?? null;
    setTape(finished);
  }

  async function handleReplay() {
    if (!tape) return;
    setReplaying(true);
    try {
      const palette = song ? getGenrePreset(song.genre).colorPalette : DEFAULT_PALETTE;
      const result = replayTape(tape, palette, 2048, 2560);
      const blob = await result.toBlob();
      setReplayUrl(URL.createObjectURL(blob));
    } finally {
      setReplaying(false);
    }
  }

  const readyToDance = !!song || micMode;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', color: 'var(--ink)', background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ padding: '0.75rem 2rem 0', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Danza</h1>
      </div>

      {!readyToDance && !dancing && !tape && (
        <div style={{ margin: '0.5rem 0 1rem' }}>
          <SongPicker onSelect={handleSelectSong} onMicMode={handleMicMode} />
        </div>
      )}

      {readyToDance && (
        <div style={{ textAlign: 'center', margin: '0.25rem 0 0.5rem' }}>
          {song ? (
            <p style={{ margin: 0 }}>
              🎵 {song.title} — {song.artist} {bpm > 0 && `· ${bpm} BPM`}{' '}
              {!dancing && <button onClick={handleChangeSong} style={{ marginLeft: 8 }}>cambiar</button>}
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              🎤 Modo micrófono {bpm > 0 && `· ${bpm} BPM`}{' '}
              {!dancing && <button onClick={handleChangeSong} style={{ marginLeft: 8 }}>cambiar</button>}
            </p>
          )}
        </div>
      )}

      {/* Controls placed above the canvas — always visible without scrolling. */}
      <div style={{ textAlign: 'center', margin: '0.5rem 0' }}>
        {!dancing ? (
          <button onClick={handleStart} disabled={!readyToDance} style={{ fontSize: 20, padding: '0.85rem 2.5rem', borderRadius: 999, fontWeight: 700 }}>
            ▶ Empezar a bailar
          </button>
        ) : (
          <button onClick={handleStop} style={{ fontSize: 20, padding: '0.85rem 2.5rem', borderRadius: 999, fontWeight: 700 }}>
            ■ Terminar
          </button>
        )}
        {tape && !dancing && (
          <button onClick={handleReplay} disabled={replaying} style={{ marginLeft: 12, fontSize: 14, padding: '0.5rem 1.25rem', borderRadius: 999 }}>
            {replaying ? 'Generando…' : '🔁 Replay hi-res (dev)'}
          </button>
        )}
      </div>

      {tape && (
        <p style={{ textAlign: 'center', opacity: 0.6, fontSize: 13, margin: '0 0 0.5rem' }}>
          {tape.frames.length} frames · {(tape.durationMs / 1000).toFixed(1)}s · {tape.beats.length} beats · {tape.bpm} BPM
        </p>
      )}

      <div style={{ position: 'relative', width: '100%', maxWidth: 720, aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, margin: '0 auto', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
        <canvas ref={paintCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <canvas ref={sparkleCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

        <div style={{ position: 'absolute', top: 12, right: 12, width: '18%', minWidth: 100, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.3)' }}>
          <video ref={videoRef} style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }} />
          <canvas ref={skeletonCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>

        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6, fontSize: 14 }}>
          {fps} fps
        </div>
      </div>

      {replayUrl && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <img src={replayUrl} alt="hi-res replay" style={{ maxWidth: 300, borderRadius: 8, border: '1px solid #444' }} />
          <div>
            <a href={replayUrl} download="replay.png" style={{ color: 'var(--c5)' }}>Descargar PNG</a>
          </div>
        </div>
      )}

      <footer style={{ padding: '1rem 2rem', opacity: 0.6, fontSize: 13, textAlign: 'center' }}>
        API: {apiOk === 'checking' ? 'checking…' : apiOk === 'ok' ? '✅' : '❌'} ·{' '}
        WS: {wsConnected ? '✅' : '⏳'} ·{' '}
        Pose: {poseStatus === 'loading' ? 'cargando…' : poseStatus === 'ready' ? '✅' : '❌'}
      </footer>
    </main>
  );
}
