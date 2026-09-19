// Offline processing for an uploaded phone video (plan §K — the no-WebRTC fallback, and also
// the path for a genuinely separate second dancer's clip). Produces a MotionTape identical in
// shape to the live-capture path, so it feeds the exact same reveal pipeline downstream.
import type { MotionFrame, MotionTape } from '@shared/types.ts';
import { detectPoseForce, isPoseReady } from './pose.ts';
import { FeatureTracker } from './features.ts';
import { KeyframeCapture } from './keyframes.ts';
import { BeatDetector } from '../audio/beats.ts';
import { seedFromString } from '../art/rng.ts';

export interface OfflineProcessCallbacks {
  onProgress?: (fraction: number) => void;
}

export interface OfflineProcessResult {
  tape: MotionTape;
  keyframes: KeyframeCapture;
}

export async function processUploadedVideo(videoUrl: string, callbacks: OfflineProcessCallbacks = {}): Promise<OfflineProcessResult> {
  if (!isPoseReady()) throw new Error('pose model not initialized yet');

  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = false;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('video failed to load'));
  });

  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(video);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  analyser.connect(ctx.destination); // audible during processing — fine, it's a party
  const beatDetector = new BeatDetector(analyser);
  const tracker = new FeatureTracker();

  const frames: MotionFrame[] = [];
  const beats: number[] = [];
  const energySeries: number[] = [];
  const seed = seedFromString(`upload-${videoUrl}-${Date.now()}`);
  const keyframes = new KeyframeCapture();

  await video.play();

  return new Promise<OfflineProcessResult>((resolve, reject) => {
    let settled = false;
    let lastEnergy = 0;

    function step(_now: number, metadata: VideoFrameCallbackMetadata) {
      if (settled) return;
      const tMs = metadata.mediaTime * 1000;

      const result = detectPoseForce(video);
      if (result?.landmarks[0] && result.worldLandmarks[0]) {
        const frame: MotionFrame = {
          t: tMs,
          lm: result.landmarks[0].map((p) => [p.x, p.y, p.z, p.visibility ?? 1]),
          world: result.worldLandmarks[0].map((p) => [p.x, -p.y, -p.z]),
        };
        frames.push(frame);
        const features = tracker.update(frame);
        energySeries.push(features.kineticEnergy);
        lastEnergy = features.kineticEnergy;
      }

      if (beatDetector.tick(performance.now())) beats.push(tMs);

      keyframes.maybeCapture(video, tMs, lastEnergy);
      if (video.duration > 0) callbacks.onProgress?.(Math.min(1, video.currentTime / video.duration));

      video.requestVideoFrameCallback(step);
    }
    video.requestVideoFrameCallback(step);

    video.onended = () => {
      if (settled) return;
      settled = true;
      const bpm = beatDetector.estimateBpm();
      source.disconnect();
      analyser.disconnect();
      void ctx.close();
      resolve({ tape: { frames, beats, bpm, energySeries, seed, durationMs: video.duration * 1000 }, keyframes });
    };
    video.onerror = () => {
      if (settled) return;
      settled = true;
      void ctx.close();
      reject(new Error('playback error during offline processing'));
    };
  });
}
