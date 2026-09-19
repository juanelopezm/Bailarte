// MediaPipe PoseLandmarker 1.0.1 — exact calls per plan §C. Assets are self-hosted
// (client/public/mediapipe/) so there is no CDN dependency at party time.
import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';

let landmarker: PoseLandmarker | null = null;
let lastVideoTime = -1;

export async function initPose(): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/mediapipe/pose_landmarker_lite.task', delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  } catch (err) {
    console.warn('[pose] GPU delegate failed, falling back to CPU', err);
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/mediapipe/pose_landmarker_lite.task', delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }
}

export function isPoseReady(): boolean {
  return landmarker !== null;
}

/**
 * Runs detection for the current video frame. Returns null when the video hasn't advanced
 * since the last call (detectForVideo requires strictly increasing timestamps) or pose isn't
 * initialized yet.
 */
export function detectPose(video: HTMLVideoElement): PoseLandmarkerResult | null {
  if (!landmarker) return null;
  if (video.currentTime === lastVideoTime) return null;
  lastVideoTime = video.currentTime;
  return landmarker.detectForVideo(video, performance.now());
}

/**
 * For offline/uploaded-video processing (driven by requestVideoFrameCallback, which already
 * guarantees a new decoded frame per call — the live-path dedup guard doesn't apply and would
 * be actively wrong here). Still passes performance.now() to MediaPipe (not video.currentTime)
 * because detectForVideo requires strictly-increasing timestamps across the ONE shared
 * landmarker instance — video.currentTime can be far smaller than a live session's already-
 * advanced wall-clock cursor. The caller tracks video.currentTime separately for the actual
 * tape-relative MotionFrame timestamp.
 */
export function detectPoseForce(video: HTMLVideoElement): PoseLandmarkerResult | null {
  if (!landmarker) return null;
  return landmarker.detectForVideo(video, performance.now());
}

export function closePose(): void {
  landmarker?.close();
  landmarker = null;
  lastVideoTime = -1;
}

// Landmark indices used throughout capture/features.ts, sculpture, and painting.
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;
