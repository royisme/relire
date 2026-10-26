/** The WAV wrapper around raw mono 16-bit PCM: real RIFF sizes, so a clip never claims more than it holds. */
import { describe, expect, test } from 'bun:test';
import { pcmToWav } from '../src/utils/wav';

const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('pcmToWav', () => {
  test('writes a canonical mono 16-bit header with the actual clip sizes', () => {
    // Two 16-bit samples at 24 kHz.
    const pcm = Uint8Array.from([0x01, 0x00, 0x02, 0x00]);
    const wav = pcmToWav(pcm, 24000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(wav.length).toBe(44 + pcm.length);
    expect(ascii(wav.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + pcm.length);
    expect(ascii(wav.subarray(8, 12))).toBe('WAVE');
    expect(ascii(wav.subarray(12, 16))).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM, not a compressed format
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(28, true)).toBe(24000 * 2);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(wav.subarray(36, 40))).toBe('data');
    expect(view.getUint32(40, true)).toBe(pcm.length);

    // Every header byte in place, so a field written at the wrong offset cannot pass on a coincidental read.
    expect(Array.from(wav.subarray(0, 44))).toEqual([
      82, 73, 70, 70, 40, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 192, 93, 0, 0, 128, 187,
      0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 4, 0, 0, 0,
    ]);
    expect(Array.from(wav.subarray(44))).toEqual([0x01, 0x00, 0x02, 0x00]);
  });

  test('an empty clip still gives a valid 44-byte header with zero sizes', () => {
    const wav = pcmToWav(new Uint8Array(), 24000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(wav.length).toBe(44);
    expect(view.getUint32(4, true)).toBe(36);
    expect(view.getUint32(40, true)).toBe(0);
    expect(wav.subarray(44).length).toBe(0);
    expect(ascii(wav.subarray(0, 4))).toBe('RIFF');
    expect(ascii(wav.subarray(36, 40))).toBe('data');
  });

  test('three samples give a 42-byte RIFF chunk and a 6-byte data chunk, at the given rate', () => {
    const wav = pcmToWav(Uint8Array.from([0xff, 0xff, 0x00, 0x00, 0x7f, 0x00]), 16000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(wav.length).toBe(50);
    expect(view.getUint32(4, true)).toBe(42);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(16000 * 2);
    expect(Array.from(wav.subarray(44))).toEqual([0xff, 0xff, 0x00, 0x00, 0x7f, 0x00]);
  });
});
