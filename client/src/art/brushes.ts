// Low-level drawing primitives for the live painter (plan §G). All randomness comes through
// the caller-supplied seeded Rng so replays are pixel-deterministic.
import type { Rng } from './rng.ts';

export interface StrokeOptions {
  width: number;
  color: string;
  alpha: number;
  /** 0..1 — higher jitter = sharper/scattered control point offset. */
  jitter: number;
  rng: Rng;
  shadowBlur?: number;
}

/** Draws a single curved stroke from (x0,y0) to (x1,y1) with a seeded perpendicular offset. */
export function strokeSegment(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  opts: StrokeOptions,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = (opts.rng() - 0.5) * 60 * opts.jitter;
  const mx = (x0 + x1) / 2 + nx * offset;
  const my = (y0 + y1) / 2 + ny * offset;

  ctx.save();
  ctx.globalAlpha = opts.alpha;
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.width;
  ctx.lineCap = 'round';
  if (opts.shadowBlur) {
    ctx.shadowBlur = opts.shadowBlur;
    ctx.shadowColor = opts.color;
  }
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.stroke();
  ctx.restore();
}

/** Scatters small dots along the stroke normal — used for sharp/jerky movement accents. */
export function splatter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  color: string,
  rng: Rng,
  count = 8,
) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * 24;
    const r = 1 + rng() * 3;
    ctx.globalAlpha = 0.3 + rng() * 0.4;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawParticle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  radius: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowBlur = radius * 3;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
