/**
 * A stored take as the assessor's audio format: 16 kHz mono 16-bit PCM. Owns the
 * browser decode of the recorded blob (webm/opus, mp4 or ogg) and the pure
 * resample/downmix/quantize steps it runs after it. No playback, no state, no provider.
 */

export const ASSESSMENT_SAMPLE_RATE = 16000;

/** Averages the channels into one, so a stereo take is scored as the mono signal it sounds like. */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const length = channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    mono[i] = sum / channels.length;
  }
  return mono;
}

/**
 * Resamples by linear interpolation. Good enough for speech scoring, which needs the
 * timing and the formants, not a studio-rate conversion.
 */
export function resampleTo16k(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === ASSESSMENT_SAMPLE_RATE) return samples;
  const ratio = sourceRate / ASSESSMENT_SAMPLE_RATE;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    out[i] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return out;
}

/** Clips to [-1, 1] and scales to signed 16-bit, where the extremes are the full-scale values. */
export function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
  }
  return out;
}

/**
 * Decodes a recorded take and converts it to what the pronunciation assessment takes.
 * Decoding uses the browser's own codecs, so a take it cannot decode rejects with the
 * browser's error; nothing here substitutes silence.
 */
export async function decodeTakeToPcm16k(blob: Blob): Promise<Int16Array> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await new Response(blob).arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
    return float32ToInt16(resampleTo16k(downmixToMono(channels), audio.sampleRate));
  } finally {
    void context.close().catch(() => undefined);
  }
}
