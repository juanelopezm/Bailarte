// Records pose frames into a MotionTape — the single source of truth every downstream artifact
// (live painter, hi-res replay, sculpture, stats) reads from. See plan §B.
import type { MotionFrame, MotionTape } from '@shared/types.ts';
import { seedFromString } from '../art/rng.ts';
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export class MotionTapeRecorder {
  private frames: MotionFrame[] = [];
  private beats: number[] = [];
  private energySeries: number[] = [];
  private startedAt: number | null = null;
  private seed: number;

  constructor(seedSource: string) {
    this.seed = seedFromString(seedSource + Date.now());
  }

  start() {
    this.startedAt = performance.now();
    this.frames = [];
    this.beats = [];
    this.energySeries = [];
  }

  isRecording(): boolean {
    return this.startedAt !== null;
  }

  /**
   * Call once per pose detection with the raw MediaPipe result. Returns the constructed
   * MotionFrame (or null if not recording / no pose found) so the caller can feed the same
   * frame straight into feature extraction + the live painter without re-deriving it.
   */
  pushPose(result: PoseLandmarkerResult): MotionFrame | null {
    if (this.startedAt === null) return null;
    const lm = result.landmarks[0];
    const world = result.worldLandmarks[0];
    if (!lm || !world) return null;
    const t = performance.now() - this.startedAt;
    const frame: MotionFrame = {
      t,
      lm: lm.map((p) => [p.x, p.y, p.z, p.visibility ?? 1]),
      // MediaPipe world landmarks: y points down, z points toward camera — negate both so the
      // sculpture (Phase 7) and stats read in a conventional right-handed, y-up frame.
      world: world.map((p) => [p.x, -p.y, -p.z]),
    };
    this.frames.push(frame);
    return frame;
  }

  /** Call every animation frame (or on audio analyser tick) with a 0..1 energy value. */
  pushEnergy(value: number) {
    if (this.startedAt === null) return;
    this.energySeries.push(value);
  }

  pushBeat() {
    if (this.startedAt === null) return;
    this.beats.push(performance.now() - this.startedAt);
  }

  stop(bpm = 0): MotionTape {
    const durationMs = this.startedAt !== null ? performance.now() - this.startedAt : 0;
    const tape: MotionTape = {
      frames: this.frames,
      beats: this.beats,
      bpm,
      energySeries: this.energySeries,
      seed: this.seed,
      durationMs,
    };
    this.startedAt = null;
    return tape;
  }
}
