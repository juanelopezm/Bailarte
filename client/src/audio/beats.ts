// Live spectral-flux onset detector (plan §D.2) — works identically for preview-mode and
// mic-mode audio since both expose a plain AnalyserNode. Used as the real-time beat pulse for
// the live painter; authoritative BPM for preview mode comes from web-audio-beat-detector
// instead (audio/preview.ts) since it can analyze the whole clip offline.
const FLUX_BINS = 100; // ~43Hz–4.3kHz at fftSize 1024 / 44.1kHz — covers kick+snare range
const WINDOW_SIZE = 43; // ~1.4s of onset-detection frames at ~30fps polling
const MIN_BEAT_GAP_MS = 250; // caps detected tempo at 240 BPM

export class BeatDetector {
  private analyser: AnalyserNode;
  private freqBuf: Uint8Array<ArrayBuffer>;
  private prevFreq: Uint8Array<ArrayBuffer>;
  private fluxWindow: number[] = [];
  private lastBeatMs = 0;
  private onsetTimes: number[] = [];

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    const size = analyser.frequencyBinCount;
    this.freqBuf = new Uint8Array(size);
    this.prevFreq = new Uint8Array(size);
  }

  /** Call every animation frame. Returns true exactly on the frame a beat is detected. */
  tick(nowMs: number): boolean {
    this.analyser.getByteFrequencyData(this.freqBuf);

    let flux = 0;
    const bins = Math.min(FLUX_BINS, this.freqBuf.length);
    for (let i = 1; i < bins; i++) {
      const d = this.freqBuf[i] - this.prevFreq[i];
      if (d > 0) flux += d;
    }
    this.prevFreq.set(this.freqBuf);

    this.fluxWindow.push(flux);
    if (this.fluxWindow.length > WINDOW_SIZE) this.fluxWindow.shift();

    const mean = this.fluxWindow.reduce((a, b) => a + b, 0) / this.fluxWindow.length;
    const variance = this.fluxWindow.reduce((a, b) => a + (b - mean) ** 2, 0) / this.fluxWindow.length;
    const stdDev = Math.sqrt(variance);

    const isBeat =
      flux > mean + 1.6 * stdDev &&
      flux > 100 &&
      nowMs - this.lastBeatMs > MIN_BEAT_GAP_MS;

    if (isBeat) {
      this.lastBeatMs = nowMs;
      this.onsetTimes.push(nowMs);
      if (this.onsetTimes.length > 16) this.onsetTimes.shift();
    }
    return isBeat;
  }

  /** Median inter-onset interval, folded into a plausible 70..180 BPM range. */
  estimateBpm(): number {
    if (this.onsetTimes.length < 4) return 0;
    const intervals = [];
    for (let i = 1; i < this.onsetTimes.length; i++) {
      intervals.push(this.onsetTimes[i] - this.onsetTimes[i - 1]);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median <= 0) return 0;
    let bpm = 60000 / median;
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    return Math.round(bpm);
  }
}
