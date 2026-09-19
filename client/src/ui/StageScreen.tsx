// The laptop/big-screen flow: setup -> dance -> reveal -> battle host.
// Phase 1: webcam + pose skeleton overlay + FPS meter. Diagnostics from Phase 0 kept in a
// collapsed footer. Later phases replace the body with the live painter, song picker, reveal.
import { useEffect, useRef, useState } from 'react';
import { getHealth } from '../net/api.ts';
import { WsClient } from '../net/ws.ts';
import { useAppStore } from '../state/store.ts';
import { startCamera, stopCamera } from '../capture/camera.ts';
import { initPose, isPoseReady, detectPose } from '../capture/pose.ts';
import { drawSkeleton } from '../capture/skeletonOverlay.ts';

export function StageScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [apiOk, setApiOk] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [poseStatus, setPoseStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fps, setFps] = useState(0);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  useEffect(() => {
    getHealth().then(() => setApiOk('ok')).catch(() => setApiOk('fail'));

    const client = new WsClient();
    const offConn = client.onConnectionChange(setWsConnected);
    client.connect();
    client.send({ type: 'join', session: 'DIAG', role: 'host' });

    return () => {
      offConn();
      client.close();
    };
  }, [setWsConnected]);

  useEffect(() => {
    let raf = 0;
    let stream: MediaStream | null = null;
    let cancelled = false;
    let frameCount = 0;
    let fpsWindowStart = performance.now();
    let loggedOnce = false;

    async function setup() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

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

      const ctx = canvas.getContext('2d')!;

      function loop() {
        if (cancelled || !video || !canvas) return;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

        if (isPoseReady()) {
          const result = detectPose(video);
          if (result && result.landmarks[0]) {
            drawSkeleton(ctx, result.landmarks[0], canvas.width, canvas.height);
            if (!loggedOnce) {
              loggedOnce = true;
              console.log('[pose] sample frame — landmarks:', result.landmarks[0].length,
                'worldLandmarks:', result.worldLandmarks[0]?.length);
            }
          }
        }

        frameCount++;
        const now = performance.now();
        if (now - fpsWindowStart >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          fpsWindowStart = now;
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

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', color: 'var(--ink)', background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ padding: '1.5rem 2rem 0' }}>
        <h1 style={{ margin: 0 }}>Danza</h1>
        <p style={{ opacity: 0.7, margin: '0.25rem 0 1rem' }}>Baila. Exprésate. Conviértete en arte.</p>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 960, margin: '0 auto' }}>
        <video
          ref={videoRef}
          style={{ width: '100%', display: 'block', transform: 'scaleX(-1)', borderRadius: 12 }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6, fontSize: 14 }}>
          {fps} fps
        </div>
      </div>

      <footer style={{ padding: '1rem 2rem', opacity: 0.6, fontSize: 13 }}>
        API: {apiOk === 'checking' ? 'checking…' : apiOk === 'ok' ? '✅' : '❌'} ·{' '}
        WS: {wsConnected ? '✅' : '⏳'} ·{' '}
        Pose: {poseStatus === 'loading' ? 'cargando…' : poseStatus === 'ready' ? '✅' : '❌'}
      </footer>
    </main>
  );
}
