// Motion features derived from consecutive MotionFrames — the mapping table in plan §F.
// EMA-smoothed so the painting reacts fluidly rather than jittering frame to frame.
import type { MotionFrame } from '@shared/types.ts';
import { LM } from './pose.ts';

export interface FrameFeatures {
  /** Smoothed world-space speed (m/s) per wrist, [left, right]. */
  wristVel: [number, number];
  /** 0..1 — how far above the shoulders the hands are (screen space). */
  handLift: number;
  /** 0..1 smoothed overall movement energy. */
  kineticEnergy: number;
  /** 0..1 rolling bounding-box area of the normalized pose (how much space the dancer fills). */
  span: number;
  /** 0..1 — 1 = fluid/continuous, 0 = sharp/jerky. */
  smoothness: number;
  /** 0..1 — 1 = both arms moving identically (mirrored). */
  symmetry: number;
}

function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const EMA_ALPHA = 0.3;
const SPAN_WINDOW_MS = 5000;

export class FeatureTracker {
  private prevFrame: MotionFrame | null = null;
  private emaWristVel: [number, number] = [0, 0];
  private emaEnergy = 0;
  private emaJerk = 0;
  private prevWristVel: [number, number] = [0, 0];
  private spanBuffer: { t: number; area: number }[] = [];

  update(frame: MotionFrame): FrameFeatures {
    const prev = this.prevFrame;
    const dt = prev ? Math.max(1, frame.t - prev.t) / 1000 : 1 / 30;

    let wristVelRaw: [number, number] = [0, 0];
    if (prev) {
      wristVelRaw = [
        dist3(frame.world[LM.L_WRIST], prev.world[LM.L_WRIST]) / dt,
        dist3(frame.world[LM.R_WRIST], prev.world[LM.R_WRIST]) / dt,
      ];
    }
    this.emaWristVel = [
      EMA_ALPHA * wristVelRaw[0] + (1 - EMA_ALPHA) * this.emaWristVel[0],
      EMA_ALPHA * wristVelRaw[1] + (1 - EMA_ALPHA) * this.emaWristVel[1],
    ];

    // Kinetic energy: weighted sum of joint speeds (wrists + ankles + nose), normalized.
    let energyRaw = 0;
    if (prev) {
      const jointWeights: [number, number][] = [
        [LM.L_WRIST, 1.3], [LM.R_WRIST, 1.3],
        [LM.L_ANKLE, 1.0], [LM.R_ANKLE, 1.0],
        [LM.NOSE, 0.5],
      ];
      let sum = 0;
      let weightTotal = 0;
      for (const [idx, w] of jointWeights) {
        sum += w * dist3(frame.world[idx], prev.world[idx]) / dt;
        weightTotal += w;
      }
      energyRaw = clamp01(sum / weightTotal / 3.2); // 3.2 m/s ~= very fast movement -> 1.0
    }
    this.emaEnergy = EMA_ALPHA * energyRaw + (1 - EMA_ALPHA) * this.emaEnergy;

    // Jerk (change in wrist velocity over time) -> smoothness.
    const jerkRaw = (Math.abs(this.emaWristVel[0] - this.prevWristVel[0]) +
      Math.abs(this.emaWristVel[1] - this.prevWristVel[1])) / dt / 2;
    this.emaJerk = EMA_ALPHA * jerkRaw + (1 - EMA_ALPHA) * this.emaJerk;
    this.prevWristVel = this.emaWristVel;
    const smoothness = clamp01(1 / (1 + this.emaJerk / 8));

    // Hand lift: wrists above shoulders (screen space, y grows downward).
    const shoulderY = (frame.lm[LM.L_SHOULDER][1] + frame.lm[LM.R_SHOULDER][1]) / 2;
    const wristY = (frame.lm[LM.L_WRIST][1] + frame.lm[LM.R_WRIST][1]) / 2;
    const handLift = clamp01((shoulderY - wristY) * 2 + 0.5);

    // Span: rolling bounding-box area of visible normalized landmarks.
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const lm of frame.lm) {
      if (lm[3] < 0.3) continue; // low-visibility landmark
      minX = Math.min(minX, lm[0]); maxX = Math.max(maxX, lm[0]);
      minY = Math.min(minY, lm[1]); maxY = Math.max(maxY, lm[1]);
    }
    const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    this.spanBuffer.push({ t: frame.t, area });
    while (this.spanBuffer.length && frame.t - this.spanBuffer[0].t > SPAN_WINDOW_MS) {
      this.spanBuffer.shift();
    }
    const span = clamp01(
      (this.spanBuffer.reduce((s, e) => s + e.area, 0) / this.spanBuffer.length) / 0.5,
    );

    // Symmetry: how similarly the two wrists are moving.
    const vSum = this.emaWristVel[0] + this.emaWristVel[1];
    const symmetry = vSum < 0.05
      ? 1
      : clamp01(1 - Math.abs(this.emaWristVel[0] - this.emaWristVel[1]) / (vSum + 0.01));

    this.prevFrame = frame;

    return {
      wristVel: this.emaWristVel,
      handLift,
      kineticEnergy: this.emaEnergy,
      span,
      smoothness,
      symmetry,
    };
  }
}
