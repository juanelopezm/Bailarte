// The core delight (plan §G): a permanent accumulating paint layer + a fading sparkle layer,
// driven by motion features (plan §F). All randomness flows through a seeded Rng so
// hiResReplay.ts can reproduce the exact same composition later.
import type { MotionFrame } from '@shared/types.ts';
import { LM } from '../capture/pose.ts';
import type { FrameFeatures } from '../capture/features.ts';
import { mulberry32, type Rng } from './rng.ts';
import { flowAngle } from './flowField.ts';
import { strokeSegment, splatter, drawParticle } from './brushes.ts';
import { lerpHex } from './color.ts';

const PAINT_JOINTS = [LM.L_WRIST, LM.R_WRIST, LM.L_ANKLE, LM.R_ANKLE] as const;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; radius: number;
}

const DEFAULT_PALETTE = ['#1a1025', '#3d2b56', '#a13d63', '#e8615a', '#f5b642', '#f2e5c8'];

export class LivePainter {
  private paintCtx: CanvasRenderingContext2D;
  private sparkleCtx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private rng: Rng;

  private currentPalette: string[] = [...DEFAULT_PALETTE];
  private targetPalette: string[] = [...DEFAULT_PALETTE];
  private paletteLerpT = 1;

  private prevFrame: MotionFrame | null = null;
  private prevScreenPos = new Map<number, [number, number]>();
  private particles: Particle[] = [];
  private beatBoostUntil = 0;
  private beatShift = 0;

  constructor(paintCanvas: HTMLCanvasElement, sparkleCanvas: HTMLCanvasElement, width: number, height: number, seed: number) {
    this.paintCtx = paintCanvas.getContext('2d')!;
    this.sparkleCtx = sparkleCanvas.getContext('2d')!;
    this.width = width;
    this.height = height;
    this.rng = mulberry32(seed);
    paintCanvas.width = width;
    paintCanvas.height = height;
    sparkleCanvas.width = width;
    sparkleCanvas.height = height;
    this.paintCtx.globalCompositeOperation = 'lighter';
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  setPalette(hexes: string[]) {
    if (hexes.length === 0) return;
    this.targetPalette = hexes;
    this.paletteLerpT = 0;
  }

  /** Sets the palette with no transition — used by hiResReplay.ts for deterministic output. */
  setPaletteImmediate(hexes: string[]) {
    if (hexes.length === 0) return;
    this.currentPalette = [...hexes];
    this.targetPalette = [...hexes];
    this.paletteLerpT = 1;
  }

  private paletteAt(index: number): string {
    const a = this.currentPalette[index % this.currentPalette.length];
    const b = this.targetPalette[index % this.targetPalette.length];
    return this.paletteLerpT >= 1 ? b : lerpHex(a, b, this.paletteLerpT);
  }

  /**
   * Call externally on detected beats (Phase 3) for a visible pulse + palette rotation.
   * Takes tape-relative time (frame.t), not wall-clock time, so replays stay deterministic.
   */
  pulseBeat(atMs: number) {
    this.beatBoostUntil = atMs + 120;
    this.beatShift++;
  }

  private toScreen(frame: MotionFrame, joint: number): [number, number] {
    const [x, y] = frame.lm[joint];
    return [(1 - x) * this.width, y * this.height];
  }

  onFrame(frame: MotionFrame, features: FrameFeatures) {
    // Tape-relative time throughout — never wall-clock — so hiResReplay.ts can reproduce the
    // exact same composition from (frames, beats, seed) alone.
    const beatBoost = frame.t < this.beatBoostUntil ? 1.8 : 1;
    const dt = this.prevFrame ? Math.max(1, frame.t - this.prevFrame.t) / 1000 : 1 / 30;

    for (const joint of PAINT_JOINTS) {
      const [x, y] = this.toScreen(frame, joint);
      const prevPos = this.prevScreenPos.get(joint);
      this.prevScreenPos.set(joint, [x, y]);
      if (!prevPos || !this.prevFrame) continue;

      const worldPrev = this.prevFrame.world[joint];
      const worldCurr = frame.world[joint];
      const speed = Math.hypot(
        worldCurr[0] - worldPrev[0],
        worldCurr[1] - worldPrev[1],
        worldCurr[2] - worldPrev[2],
      ) / dt; // m/s

      if (speed < 0.05) continue; // essentially still — don't paint a stroke

      const speedNorm = Math.min(1, speed / 3);
      const paletteIdx = Math.floor(features.handLift * (this.currentPalette.length - 1)) + this.beatShift;
      const color = this.paletteAt(paletteIdx);
      const width = (2 + 14 * speedNorm) * (0.6 + features.span * 1.6) * beatBoost;
      const alpha = Math.min(0.9, Math.max(0.25, 0.25 + speedNorm * 0.65));
      const jitter = 1 - features.smoothness;

      strokeSegment(this.paintCtx, prevPos[0], prevPos[1], x, y, {
        width, color, alpha, jitter, rng: this.rng,
        shadowBlur: 4 + features.kineticEnergy * 22,
      });

      if (features.symmetry > 0.7) {
        strokeSegment(
          this.paintCtx,
          this.width - prevPos[0], prevPos[1], this.width - x, y,
          { width, color, alpha, jitter, rng: this.rng },
        );
      }

      if (features.smoothness < 0.55 && speedNorm > 0.6) {
        splatter(this.paintCtx, x, y, color, this.rng, 8);
      }

      this.spawnParticles(x, y, features.kineticEnergy, color, frame.t);
    }

    this.prevFrame = frame;
  }

  private spawnParticles(x: number, y: number, energy: number, color: string, tapeMs: number) {
    const count = Math.round(energy * 6);
    for (let i = 0; i < count; i++) {
      const angle = flowAngle(x, y, tapeMs) + (this.rng() - 0.5);
      const speed = 20 + this.rng() * 60;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.6 + this.rng() * 0.6,
        color,
        radius: 1 + this.rng() * 3,
      });
    }
    // Hard cap so a long energetic dance doesn't unbounded-grow memory/draw cost.
    if (this.particles.length > 800) this.particles.splice(0, this.particles.length - 800);
  }

  /** Advances palette transition + sparkle particles. Call every animation frame. */
  tick(nowMs: number, dtMs: number) {
    if (this.paletteLerpT < 1) {
      this.paletteLerpT = Math.min(1, this.paletteLerpT + dtMs / 1200);
      if (this.paletteLerpT >= 1) this.currentPalette = [...this.targetPalette];
    }

    const dt = dtMs / 1000;
    this.sparkleCtx.save();
    this.sparkleCtx.globalCompositeOperation = 'source-over';
    this.sparkleCtx.fillStyle = 'rgba(0,0,0,0.12)';
    this.sparkleCtx.fillRect(0, 0, this.width, this.height);
    this.sparkleCtx.globalCompositeOperation = 'lighter';

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const angle = flowAngle(p.x, p.y, nowMs);
      p.vx += Math.cos(angle) * 8 * dt;
      p.vy += Math.sin(angle) * 8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt / p.maxLife;
      if (p.life <= 0 || p.x < -20 || p.x > this.width + 20 || p.y < -20 || p.y > this.height + 20) {
        this.particles.splice(i, 1);
        continue;
      }
      drawParticle(this.sparkleCtx, p.x, p.y, p.radius, p.color, Math.max(0, p.life));
    }
    this.sparkleCtx.restore();
  }

  reset() {
    this.paintCtx.clearRect(0, 0, this.width, this.height);
    this.sparkleCtx.clearRect(0, 0, this.width, this.height);
    this.prevFrame = null;
    this.prevScreenPos.clear();
    this.particles = [];
    this.beatShift = 0;
  }
}
