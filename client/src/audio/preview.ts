// Offline, authoritative BPM+offset for preview-mode songs — decodes the whole 30s clip once
// and runs web-audio-beat-detector's guess() (plan §D.1), rather than relying on the live
// spectral-flux detector alone.
import { guess } from 'web-audio-beat-detector';

export async function analyzePreviewBpm(previewUrl: string, ctx: AudioContext): Promise<{ bpm: number; offset: number } | null> {
  try {
    const res = await fetch(`/api/itunes/preview?url=${encodeURIComponent(previewUrl)}`);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const result = await guess(audioBuffer);
    return { bpm: result.bpm, offset: result.offset };
  } catch (err) {
    console.warn('[preview] bpm analysis failed, falling back to live detection', err);
    return null;
  }
}

/** Schedules a callback on every beat of a known BPM+offset grid, looping with the audio. */
export class BeatGrid {
  private offsetSec: number;
  private periodSec: number;

  constructor(bpm: number, offsetSec: number) {
    this.offsetSec = offsetSec;
    this.periodSec = 60 / bpm;
  }

  /** Given the audio element's currentTime (seconds), returns true once per beat window. */
  isOnBeat(currentTimeSec: number, toleranceSec = 0.05): boolean {
    let t = (currentTimeSec - this.offsetSec) % this.periodSec;
    if (t < 0) t += this.periodSec;
    return t < toleranceSec || t > this.periodSec - toleranceSec;
  }
}
