// Keyframe ring buffer for vision analysis (plan §E). Every ~2s during the dance, grabs a
// downscaled JPEG of the video feed, tagged with the instantaneous energy at that moment so
// Stage B can later pick the energy-peak frames.
export interface Keyframe {
  t: number; // ms since dance start
  energy: number;
  base64: string; // no data-URI prefix
}

const CAPTURE_INTERVAL_MS = 2000;
const TARGET_WIDTH = 640;

export class KeyframeCapture {
  private frames: Keyframe[] = [];
  private lastCaptureMs = -Infinity;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;

  /** Call every animation frame while dancing. Captures at most once per interval. */
  maybeCapture(video: HTMLVideoElement, elapsedMs: number, energy: number) {
    if (elapsedMs - this.lastCaptureMs < CAPTURE_INTERVAL_MS) return;
    if (!video.videoWidth) return;
    this.lastCaptureMs = elapsedMs;

    const scale = TARGET_WIDTH / video.videoWidth;
    this.canvas.width = TARGET_WIDTH;
    this.canvas.height = Math.round(video.videoHeight * scale);
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.7);
    const base64 = dataUrl.split(',')[1] ?? '';
    this.frames.push({ t: elapsedMs, energy, base64 });
  }

  reset() {
    this.frames = [];
    this.lastCaptureMs = -Infinity;
  }

  latest(): Keyframe | null {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
  }

  /** Picks up to `count` frames for Stage B: the energy peak, plus the rest spread evenly. */
  pickForFullAnalysis(count = 8): Keyframe[] {
    if (this.frames.length <= count) return [...this.frames];
    const peak = this.frames.reduce((a, b) => (b.energy > a.energy ? b : a));
    const remaining = this.frames.filter((f) => f !== peak);
    const step = remaining.length / (count - 1);
    const spread: Keyframe[] = [];
    for (let i = 0; i < count - 1; i++) {
      spread.push(remaining[Math.min(remaining.length - 1, Math.floor(i * step))]);
    }
    return [peak, ...spread].sort((a, b) => a.t - b.t);
  }
}
