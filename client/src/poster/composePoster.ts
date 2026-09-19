// Poster / gallery card composer (plan §J). 1600x2000 canvas: hero painting, palette chips,
// title, stats row, optional sculpture snapshot, footer. 'champion' variant adds a gold banner.
import { deriveBackground, contrastTextColor } from '@shared/palettes.ts';
import type { DanceStats, SongInfo, VisionAnalysis } from '@shared/types.ts';

export interface PosterInput {
  paintingUrl: string;
  analysis: VisionAnalysis;
  song: SongInfo | null;
  stats: DanceStats;
  dancerName: string;
  sculptureSnapshotUrl?: string | null;
  variant?: 'standard' | 'champion';
  votes?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function composePoster(input: PosterInput): Promise<HTMLCanvasElement> {
  const W = 1600;
  const H = 2000;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = deriveBackground(input.analysis.colorPalette);
  const ink = contrastTextColor(bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Hero painting — cover-fit into the top ~62% of the canvas.
  const heroMargin = 60;
  const heroH = Math.round(H * 0.62);
  const heroW = W - heroMargin * 2;
  const img = await loadImage(input.paintingUrl);
  const scale = Math.max(heroW / img.width, heroH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = heroMargin + (heroW - dw) / 2;
  const dy = heroMargin + (heroH - dh) / 2;

  ctx.save();
  roundRect(ctx, heroMargin, heroMargin, heroW, heroH, 24);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  ctx.strokeStyle = ink === '#ffffff' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 6;
  roundRect(ctx, heroMargin, heroMargin, heroW, heroH, 24);
  ctx.stroke();

  let y = heroMargin + heroH + 50;

  // Palette chips.
  const chipSize = 36;
  const chipGap = 14;
  const totalChipsW = input.analysis.colorPalette.length * chipSize + (input.analysis.colorPalette.length - 1) * chipGap;
  let cx = (W - totalChipsW) / 2;
  for (const hex of input.analysis.colorPalette) {
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.arc(cx + chipSize / 2, y + chipSize / 2, chipSize / 2, 0, Math.PI * 2);
    ctx.fill();
    cx += chipSize + chipGap;
  }
  y += chipSize + 45;

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';

  ctx.font = '700 54px system-ui, sans-serif';
  const titleLine = input.song ? `${input.dancerName} — ${input.song.title}` : input.dancerName;
  ctx.fillText(titleLine, W / 2, y);
  y += 58;

  if (input.song?.artist) {
    ctx.font = '400 30px system-ui, sans-serif';
    ctx.globalAlpha = 0.75;
    ctx.fillText(input.song.artist, W / 2, y);
    ctx.globalAlpha = 1;
    y += 48;
  }

  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillText(`${input.analysis.danceStyle} · ${input.analysis.culture} · ${input.analysis.mood}`, W / 2, y);
  y += 65;

  // Stats row.
  const stats: [string, string][] = [
    [`${(input.stats.durationMs / 1000).toFixed(0)}s`, 'duración'],
    [input.stats.bpm > 0 ? String(input.stats.bpm) : '—', 'BPM'],
    [input.stats.wristTravelMeters.toFixed(1), 'metros'],
    [String(input.stats.jumps), 'saltos'],
    [String(input.stats.spins), 'giros'],
    [`${Math.round(input.stats.grooveSyncPct * 100)}%`, 'sincronía'],
  ];
  const statW = W / stats.length;
  for (let i = 0; i < stats.length; i++) {
    const [value, label] = stats[i];
    const x = statW * i + statW / 2;
    ctx.font = '700 38px system-ui, sans-serif';
    ctx.fillText(value, x, y);
    ctx.font = '400 20px system-ui, sans-serif';
    ctx.globalAlpha = 0.6;
    ctx.fillText(label, x, y + 30);
    ctx.globalAlpha = 1;
  }
  y += 90;

  if (input.sculptureSnapshotUrl) {
    try {
      const sculptImg = await loadImage(input.sculptureSnapshotUrl);
      const sw = 280;
      const sh = 190;
      const sx = (W - sw) / 2;
      ctx.save();
      roundRect(ctx, sx, y, sw, sh, 12);
      ctx.clip();
      ctx.fillStyle = '#000';
      ctx.fillRect(sx, y, sw, sh);
      ctx.drawImage(sculptImg, sx, y, sw, sh);
      ctx.restore();
      y += sh + 30;
    } catch (err) {
      console.warn('[poster] sculpture snapshot failed to load', err);
    }
  }

  if (input.variant === 'champion') {
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillStyle = '#f5c542';
    ctx.fillText(`👑 CAMPEÓN DE LA FIESTA — ${input.votes ?? 0} votos`, W / 2, y + 10);
  }

  ctx.font = '400 20px system-ui, sans-serif';
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.fillText(`DANZA · ${new Date().toLocaleDateString('es')}`, W / 2, H - 40);
  ctx.globalAlpha = 1;

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
