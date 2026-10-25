import { expect, test } from 'bun:test';
import { MAX_DATABASE_BYTES, readApkg } from '../src/services/vocabulary/import/apkg';
import {
  MAX_TEXT_BYTES,
  MAX_TEXT_ROWS,
  parsePlainText,
  readPlainTextFile,
} from '../src/services/vocabulary/import/plainText';
import { ImportRefusal } from '../src/services/vocabulary/import/refusal';
import { fixturePackage, rawZstd } from './fixtures/apkg';
import { failure } from './fixtures/storage';

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

test('Zstandard 4/8-byte content sizes are bounded before decoding or allocating output', async () => {
  for (const flag of [2, 3]) {
    const frame = new Uint8Array(16);
    frame.set([0x28, 0xb5, 0x2f, 0xfd, (flag << 6) | 32]);
    new DataView(frame.buffer).setBigUint64(5, BigInt(MAX_DATABASE_BYTES) + 1n, true);
    const error = await failure(readApkg(fixturePackage(frame, 'collection.anki21b')));
    expect(error).toBeInstanceOf(ImportRefusal);
    expect(error).toMatchObject({
      problem: { key: 'vocab.import.errors.databaseTooLarge' },
    });
  }
  const unknown = rawZstd(new Uint8Array());
  unknown[4] = 0;
  expect(await failure(readApkg(fixturePackage(unknown, 'collection.anki21b')))).toMatchObject({
    problem: { key: 'vocab.import.errors.unknownDatabaseSize' },
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
