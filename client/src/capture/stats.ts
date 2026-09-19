// Computes DanceStats from a finished MotionTape (plan §J stats row + §H prompt hints).
import type { DanceStats, MotionTape } from '@shared/types.ts';
import { FeatureTracker } from './features.ts';
import { LM } from './pose.ts';

function dist3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function computeStats(tape: MotionTape): DanceStats {
  const { frames, beats, energySeries, bpm, durationMs } = tape;

  let wristTravelMeters = 0;
  let jumps = 0;
  let spins = 0;
  let spinAccumRad = 0;
  let lastAnkleY = 0;
  let aboveBaselineSince = -Infinity;
  let lastJumpMs = -Infinity;
  let lastShoulderAngle: number | null = null;

  const tracker = new FeatureTracker();
  let smoothnessSum = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const features = tracker.update(frame);
    smoothnessSum += features.smoothness;

    if (i > 0) {
      const prev = frames[i - 1];
      wristTravelMeters += dist3(frame.world[LM.L_WRIST], prev.world[LM.L_WRIST]);
      wristTravelMeters += dist3(frame.world[LM.R_WRIST], prev.world[LM.R_WRIST]);
    }

    // Jumps: both ankles rise well above their recent baseline, then a 600ms refractory period.
    const ankleY = (frame.world[LM.L_ANKLE][1] + frame.world[LM.R_ANKLE][1]) / 2;
    const rising = ankleY - lastAnkleY > 0.03;
    if (rising && frame.t - lastJumpMs > 600) {
      if (aboveBaselineSince === -Infinity) aboveBaselineSince = frame.t;
      if (frame.t - aboveBaselineSince > 60 && frame.t - aboveBaselineSince < 500) {
        jumps++;
        lastJumpMs = frame.t;
        aboveBaselineSince = -Infinity;
      }
    } else {
      aboveBaselineSince = -Infinity;
    }
    lastAnkleY = ankleY;

    // Spins: unwrap the shoulder line's angle in the XZ plane; every ~2π accumulated = 1 spin.
    const dx = frame.world[LM.R_SHOULDER][0] - frame.world[LM.L_SHOULDER][0];
    const dz = frame.world[LM.R_SHOULDER][2] - frame.world[LM.L_SHOULDER][2];
    const angle = Math.atan2(dz, dx);
    if (lastShoulderAngle !== null) {
      let delta = angle - lastShoulderAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      spinAccumRad += Math.abs(delta);
    }
    lastShoulderAngle = angle;
  }
  spins = Math.floor(spinAccumRad / (2 * Math.PI));

  const smoothness = frames.length > 0 ? smoothnessSum / frames.length : 1;

  // Peak moment: the frame with the highest recorded energy.
  let peakMomentMs = 0;
  if (energySeries.length > 0 && frames.length > 0) {
    let peakIdx = 0;
    for (let i = 1; i < energySeries.length; i++) {
      if (energySeries[i] > energySeries[peakIdx]) peakIdx = i;
    }
    peakMomentMs = frames[Math.min(peakIdx, frames.length - 1)]?.t ?? 0;
  }

  // Groove sync: fraction of beats where energy spiked (>= rolling mean * 1.15) within ±150ms.
  let syncedBeats = 0;
  if (beats.length > 0 && energySeries.length > 0) {
    const windowMs = 150;
    const meanEnergy = energySeries.reduce((a, b) => a + b, 0) / energySeries.length;
    for (const beatT of beats) {
      const nearby = frames
        .map((f, i) => ({ t: f.t, e: energySeries[i] ?? 0 }))
        .filter((f) => Math.abs(f.t - beatT) <= windowMs);
      if (nearby.some((f) => f.e >= meanEnergy * 1.15)) syncedBeats++;
    }
  }
  const grooveSyncPct = beats.length > 0 ? syncedBeats / beats.length : 0;

  return {
    durationMs,
    bpm,
    wristTravelMeters,
    jumps,
    spins,
    peakMomentMs,
    smoothness,
    grooveSyncPct,
  };
}
