/**
 * The pure steps that turn a decoded take into 16 kHz mono PCM: mono downmix, resampling and
 * float32 to int16. The browser decode path itself is not covered here.
 */
import { describe, expect, test } from 'bun:test';
import { downmixToMono, float32ToInt16, resampleTo16k } from '../src/utils/speech/pcm';

const RAMP_48K = Float32Array.from({ length: 48000 }, (_, i) => i / 48000);

describe('resampleTo16k', () => {
  test('turns one second at 48 kHz into 16000 samples', () => {
    expect(resampleTo16k(RAMP_48K, 48000).length).toBe(16000);
  });

  test('keeps a 44.1 kHz second to 16000 samples', () => {
    expect(resampleTo16k(new Float32Array(44100), 44100).length).toBe(16000);
  });

  test('keeps the signal, not just its length', () => {
    const tone = Float32Array.from({ length: 48000 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000));
    const resampled = resampleTo16k(tone, 48000);
    // Same 440 Hz tone sampled at 16 kHz: the peaks still reach the original amplitude.
    expect(Math.max(...resampled)).toBeCloseTo(1, 1);
    expect(Math.min(...resampled)).toBeCloseTo(-1, 1);
  });

  test('returns the samples untouched at 16 kHz', () => {
    const input = Float32Array.from([0.25, -0.5]);
    expect(resampleTo16k(input, 16000)).toBe(input);
  });
});

describe('float32ToInt16', () => {
  test('scales full-scale values to the int16 extremes', () => {
    expect(Array.from(float32ToInt16(Float32Array.from([0, 1, -1, 0.5])))).toEqual([0, 32767, -32768, 16383]);
  });

  test('clips beyond full scale instead of wrapping', () => {
    expect(Array.from(float32ToInt16(Float32Array.from([2, -2, 1.5])))).toEqual([32767, -32768, 32767]);
  });
});

describe('downmixToMono', () => {
  test('averages a stereo buffer into one channel', () => {
    const left = Float32Array.from([1, 0, -1]);
    const right = Float32Array.from([0, 1, -1]);
    expect(Array.from(downmixToMono([left, right]))).toEqual([0.5, 0.5, -1]);
  });

  test('leaves a mono buffer as it is', () => {
    const mono = Float32Array.from([0.1, 0.2]);
    expect(downmixToMono([mono])).toBe(mono);
  });
});
