/** Material input boundaries and selections; decoding/rendering is checked in installed Chrome. */
import { expect, test } from 'bun:test';
import {
  clipboardImage,
  parsePageSelection,
  validateImageDimensions,
  validateMaterialFile,
  validateMaterialPages,
  validatePdfPageCount,
} from '../src/services/importMaterial';

const MiB = 1024 * 1024;

test('importMaterial accepts supported MIME types at their size boundary and PDF extension without a MIME type', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    expect(validateMaterialFile({ name: 'image', type, size: 10 * MiB })).toBe('image');
    expect(() => validateMaterialFile({ name: 'image', type, size: 10 * MiB + 1 })).toThrow();
  }
  expect(validateMaterialFile({ name: 'book', type: 'application/pdf', size: 20 * MiB })).toBe('pdf');
  expect(validateMaterialFile({ name: 'book.PDF', type: '', size: 1 })).toBe('pdf');
  for (const file of [
    { name: 'book.pdf', type: 'application/pdf', size: 20 * MiB + 1 },
    { name: 'empty.png', type: 'image/png', size: 0 },
    { name: 'empty.pdf', type: 'application/pdf', size: 0 },
    { name: 'vector.svg', type: 'image/svg+xml', size: 1 },
    { name: 'fake.pdf', type: 'text/plain', size: 1 },
    { name: 'no-mime.png', type: '', size: 1 },
  ])
    expect(() => validateMaterialFile(file)).toThrow();
});

test('importMaterial bounds decoded images at 20MP and PDF documents at 100 pages', () => {
  expect(() => validateImageDimensions(5000, 4000)).not.toThrow();
  expect(() => validateImageDimensions(5001, 4000)).toThrow();
  expect(() => validateImageDimensions(0, 100)).toThrow();
  expect(() => validatePdfPageCount(100)).not.toThrow();
  for (const count of [0, 101, NaN, 1.5]) expect(() => validatePdfPageCount(count)).toThrow();
});

test('importMaterial parses, sorts and deduplicates up to three pages within document bounds', () => {
  expect(parsePageSelection('3, 1 - 2, 2', 100)).toEqual([1, 2, 3]);
  expect(parsePageSelection('100', 100)).toEqual([100]);
  for (const value of ['0', '1-10000', '1,2,3,4', '4-2', '6', 'abc', '', '1,', '-1', '1.5', '9007199254740993'])
    expect(() => parsePageSelection(value, 5)).toThrow();
  for (const count of [0, 101, NaN]) expect(() => parsePageSelection('1', count)).toThrow();
  expect(validateMaterialPages([3, 1, 3], 3)).toEqual([1, 3]);
  for (const pages of [[], [0], [4], [1.5], [NaN], [1, 2, 3, 4]])
    expect(() => validateMaterialPages(pages, 3)).toThrow();
});

test('importMaterial clipboard ingestion ignores text and unsupported files without needing DataTransfer', () => {
  const file = new File(['png'], 'clipboard.png', { type: 'image/png' });
  const item = (kind: string, type: string, result: File | null) => ({ kind, type, getAsFile: () => result });
  expect(
    clipboardImage({ items: [item('string', 'text/plain', null), item('file', 'image/svg+xml', file)] }),
  ).toBeNull();
  expect(clipboardImage({ items: [item('file', 'image/png', null), item('file', 'image/png', file)] })).toBe(file);
});
