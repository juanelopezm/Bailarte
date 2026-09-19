// The laptop/big-screen flow: setup -> dance -> reveal -> battle host.
// Phase 2: live generative painting (DELIGHT #1) driven by the MotionTape + feature pipeline.
// The paint/sparkle canvases are the main view; the camera becomes a small PiP with the
// skeleton overlay so the dancer can see their own tracking.
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
import type { MotionTape } from '@shared/types.ts';

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
  const wsConnected = useAppStore((s) => s.wsConnected);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  const recorderRef = useRef<MotionTapeRecorder | null>(null);
  const trackerRef = useRef<FeatureTracker>(new FeatureTracker());
  const painterRef = useRef<LivePainter | null>(null);
  const dancingRef = useRef(false);

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
    };
  }, []);

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
    const finished = recorderRef.current?.stop() ?? null;
    setTape(finished);
  }

  async function handleReplay() {
    if (!tape) return;
    setReplaying(true);
    try {
      const result = replayTape(tape, DEFAULT_PALETTE, 2048, 2560);
      const blob = await result.toBlob();
      setReplayUrl(URL.createObjectURL(blob));
    } finally {
      setReplaying(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', color: 'var(--ink)', background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ padding: '1.5rem 2rem 0' }}>
        <h1 style={{ margin: 0 }}>Danza</h1>
        <p style={{ opacity: 0.7, margin: '0.25rem 0 1rem' }}>Baila. Exprésate. Conviértete en arte.</p>
      </div>

      <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H, margin: '0 auto', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
        <canvas ref={paintCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <canvas ref={sparkleCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

        <div style={{ position: 'absolute', top: 12, right: 12, width: 220, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.3)' }}>
          <video ref={videoRef} style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }} />
          <canvas ref={skeletonCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>

        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6, fontSize: 14 }}>
          {fps} fps
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
        {!dancing ? (
          <button onClick={handleStart} style={{ fontSize: 18, padding: '0.75rem 2rem', borderRadius: 999 }}>
            ▶ Empezar a bailar
          </button>
        ) : (
          <button onClick={handleStop} style={{ fontSize: 18, padding: '0.75rem 2rem', borderRadius: 999 }}>
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
        <p style={{ textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
          {tape.frames.length} frames · {(tape.durationMs / 1000).toFixed(1)}s
        </p>
      )}

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
