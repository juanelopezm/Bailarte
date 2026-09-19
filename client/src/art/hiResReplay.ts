// Deterministic hi-res re-render of a full MotionTape (plan §G). Runs the exact same
// feature-extraction + painting pipeline synchronously (no real-time waiting), seeded from
// the tape's stored seed, so the output is pixel-reproducible. Used as (a) the guaranteed
// "digital painting" fallback and (b) the image input to Gemini (plan §H).
import type { MotionTape } from '@shared/types.ts';
import { FeatureTracker } from '../capture/features.ts';
import { LivePainter } from './livePainter.ts';

export interface ReplayResult {
  canvas: HTMLCanvasElement;
  toBlob: () => Promise<Blob>;
  toPngBase64: () => string;
}

export function replayTape(
  tape: MotionTape,
  palette: string[],
  width = 2048,
  height = 2560,
): ReplayResult {
  const paintCanvas = document.createElement('canvas');
  const sparkleCanvas = document.createElement('canvas'); // unused output, but LivePainter needs it
  const painter = new LivePainter(paintCanvas, sparkleCanvas, width, height, tape.seed);
  painter.setPaletteImmediate(palette);

  const tracker = new FeatureTracker();
  let beatIdx = 0;

  for (const frame of tape.frames) {
    while (beatIdx < tape.beats.length && tape.beats[beatIdx] <= frame.t) {
      painter.pulseBeat(tape.beats[beatIdx]);
      beatIdx++;
    }
    const features = tracker.update(frame);
    painter.onFrame(frame, features);
  }

  return {
    canvas: paintCanvas,
    toBlob: () =>
      new Promise<Blob>((resolve, reject) => {
        paintCanvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
      }),
    toPngBase64: () => paintCanvas.toDataURL('image/png').split(',')[1] ?? '',
  };
}
