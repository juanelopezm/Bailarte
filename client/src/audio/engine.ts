// Audio source wiring (plan §D). Two modes share one AnalyserNode-based interface:
// - Preview mode: <audio loop> -> MediaElementSource -> analyser -> destination (clean signal,
//   no mic, zero echo risk).
// - Mic mode: getUserMedia -> MediaStreamSource -> analyser only (NOT connected to destination,
//   so there's no feedback loop) with echo cancellation / noise suppression / AGC all disabled,
//   since those are designed to remove exactly the music signal we want to analyze.
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

export interface AudioSource {
  ctx: AudioContext;
  analyser: AnalyserNode;
  stop(): void;
}

export function createPreviewSource(previewUrl: string): { source: AudioSource; audioEl: HTMLAudioElement } {
  const ctx = getCtx();
  const audioEl = new Audio(`/api/itunes/preview?url=${encodeURIComponent(previewUrl)}`);
  audioEl.crossOrigin = 'anonymous';
  audioEl.loop = true;

  const node = ctx.createMediaElementSource(audioEl);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  node.connect(analyser);
  analyser.connect(ctx.destination);

  return {
    audioEl,
    source: {
      ctx,
      analyser,
      stop: () => {
        audioEl.pause();
        node.disconnect();
        analyser.disconnect();
      },
    },
  };
}

export async function createMicSource(): Promise<AudioSource> {
  const ctx = getCtx();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const node = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  node.connect(analyser); // deliberately NOT connected to ctx.destination — no feedback loop

  return {
    ctx,
    analyser,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      node.disconnect();
      analyser.disconnect();
    },
  };
}

/** 0..1 RMS level of the current time-domain signal — used for decorative rhythm intensity. */
export function readRmsEnergy(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sumSquares = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sumSquares += v * v;
  }
  return Math.sqrt(sumSquares / buf.length);
}
