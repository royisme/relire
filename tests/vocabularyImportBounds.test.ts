import { expect, test } from 'bun:test';
import { decodeCollection, MAX_DATABASE_BYTES, readApkg } from '../src/services/vocabulary/import/apkg';
import {
  MAX_TEXT_BYTES,
  MAX_TEXT_ROWS,
  parsePlainText,
  readPlainTextFile,
} from '../src/services/vocabulary/import/plainText';
import { ImportRefusal } from '../src/services/vocabulary/import/refusal';
import { rawZstd } from './fixtures/apkg';
import { failure } from './fixtures/storage';
import { streamingZeros } from './fixtures/streamZstd';

/** Empty stored entry with a deliberately oversized declared expansion; no large allocation in the fixture. */
function declaredZip(name: string, originalSize: number) {
  const filename = new TextEncoder().encode(name);
  const localSize = 30 + filename.length;
  const centralSize = 46 + filename.length;
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint32(22, originalSize, true);
  view.setUint16(26, filename.length, true);
  bytes.set(filename, 30);
  view.setUint32(localSize, 0x02014b50, true);
  view.setUint32(localSize + 24, originalSize, true);
  view.setUint16(localSize + 28, filename.length, true);
  bytes.set(filename, localSize + 46);
  const end = localSize + centralSize;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, centralSize, true);
  view.setUint32(end + 16, localSize, true);
  return bytes;
}

test('every collection ZIP entry is refused by declared original size before inflation', async () => {
  for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    expect(await failure(readApkg(declaredZip(name, MAX_DATABASE_BYTES + 1)))).toMatchObject({
      problem: { key: 'vocab.import.errors.databaseTooLarge', params: { size: 200 } },
    });
  }
});

test('streaming Zstandard caps actual output and stops before decoding a corrupt remainder', async () => {
  expect(streamingZeros[4] & 0xe0).toBe(0); // No content-size flag or single-segment size.
  expect((await decodeCollection(streamingZeros)).byteLength).toBe(8 * 1024 * 1024);
  const maxBytes = 128 * 1024;
  // Only two blocks are present: without the cap, decoding would continue and throw unexpected EOF.
  const truncated = streamingZeros.subarray(0, 25);
  expect(await failure(decodeCollection(truncated))).toMatchObject({
    message: expect.stringContaining('unexpected EOF'),
  });
  const error = await failure(decodeCollection(truncated, maxBytes));
  expect(error).toBeInstanceOf(ImportRefusal);
  expect(error).toMatchObject({
    problem: { key: 'vocab.import.errors.databaseTooLarge', params: { size: 0.125 } },
  });
  expect(await failure(decodeCollection(streamingZeros, maxBytes))).toMatchObject({
    problem: { key: 'vocab.import.errors.databaseTooLarge' },
  });
});

test('a Zstandard frame that understates its content size cannot bypass the output cap', async () => {
  const frame = rawZstd(new Uint8Array(64));
  new DataView(frame.buffer).setUint32(5, 16, true);
  expect(await failure(decodeCollection(frame, 32))).toMatchObject({
    problem: { key: 'vocab.import.errors.databaseTooLarge' },
  });
});

test('Zstandard cap counts concatenated frames and allows exactly the limit across input chunks', async () => {
  const data = new Uint8Array(128 * 1024).fill(42);
  const frame = rawZstd(data);
  const frames = new Uint8Array(frame.length * 9);
  for (let offset = 0; offset < frames.length; offset += frame.length) frames.set(frame, offset);
  const maxBytes = data.length * 9;
  expect(await decodeCollection(frames, maxBytes)).toEqual(new Uint8Array(maxBytes).fill(42));
  expect(await failure(decodeCollection(frames, maxBytes - 1))).toMatchObject({
    problem: { key: 'vocab.import.errors.databaseTooLarge' },
  });
});

test('text file cap refuses a real oversized file before reading its contents', async () => {
  const file = new File(['x'.repeat(MAX_TEXT_BYTES + 1)], 'TEST.csv');
  expect(await failure(readPlainTextFile(file))).toMatchObject({
    problem: { key: 'vocab.import.errors.textTooLarge', params: { size: 10 } },
  });
  expect(
    await failure(
      readPlainTextFile({
        size: MAX_TEXT_BYTES + 1,
        text: () => {
          throw new Error('TEST must not read');
        },
      }),
    ),
  ).toBeInstanceOf(ImportRefusal);
});

test('text row cap counts logical notes, including refused records, not quoted newlines', () => {
  const text = 'chat,"cat\npet"\n'.repeat(MAX_TEXT_ROWS);
  expect(parsePlainText(text).rows).toHaveLength(MAX_TEXT_ROWS);
  expect(() => parsePlainText(text + 'chien,dog')).toThrow('vocab.import.errors.tooManyRows');
});
