// Draws a pose skeleton (dots + connection lines) on an overlay canvas, in mirrored screen
// space to match the mirrored <video> the dancer sees themselves in.
import { PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#f5b642';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#e8615a';

  for (const conn of PoseLandmarker.POSE_CONNECTIONS) {
    const a = landmarks[conn.start];
    const b = landmarks[conn.end];
    if (!a || !b) continue;
    ctx.beginPath();
    // Mirror x so the overlay matches the mirrored video feed.
    ctx.moveTo((1 - a.x) * width, a.y * height);
    ctx.lineTo((1 - b.x) * width, b.y * height);
    ctx.stroke();
  }

  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc((1 - lm.x) * width, lm.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
