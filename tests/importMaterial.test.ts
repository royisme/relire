/** Material input boundaries and selections; decoding/rendering is checked in installed Chrome. */
import { expect, test } from 'bun:test';
import {
  clipboardFiles,
  validateMaterialAddition,
  type ImportMaterial,
  parsePageSelection,
  validateImageDimensions,
  validateMaterialFile,
  validateMaterialPages,
  validatePdfPageCount,
} from '../src/services/importMaterial';
import { MAX_EXTRACT_IMAGES } from '../src/services/ai/tasks';

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

test('importMaterial preview and sender selection share the five-page cap, sorting and deduplication', () => {
  expect(MAX_EXTRACT_IMAGES).toBe(5);
  expect(parsePageSelection('5, 1 - 4, 2', 100)).toEqual([1, 2, 3, 4, 5]);
  expect(parsePageSelection('1-5', 100)).toEqual([1, 2, 3, 4, 5]);
  expect(parsePageSelection('100', 100)).toEqual([100]);
  expect(validateMaterialPages([5, 1, 5, 4, 2, 3], 100)).toEqual([1, 2, 3, 4, 5]);
  expect(() => parsePageSelection('1,2,3,4,5,6', 100)).toThrow('at most 5 pages');
  expect(() => parsePageSelection('1-6', 100)).toThrow('at most 5 pages');
  for (const value of ['0', '1-10000', '1,2,3,4,5,6', '4-2', '6', 'abc', '', '1,', '-1', '1.5', '9007199254740993'])
    expect(() => parsePageSelection(value, 5)).toThrow();
  for (const count of [0, 101, NaN]) expect(() => parsePageSelection('1', count)).toThrow();
  expect(validateMaterialPages([3, 1, 3], 3)).toEqual([1, 3]);
  for (const pages of [[], [0], [4], [1.5], [NaN], [1, 2, 3, 4]])
    expect(() => validateMaterialPages(pages, 3)).toThrow();
});

test('clipboard intake keeps all files in order, including wrong types for inline validation', () => {
  const first = new File(['png'], 'first.png', { type: 'image/png' });
  const second = new File(['webp'], 'second.webp', { type: 'image/webp' });
  const wrong = new File(['svg'], 'wrong.svg', { type: 'image/svg+xml' });
  const item = (kind: string, file: File | null) => ({ kind, getAsFile: () => file });
  expect(clipboardFiles({ items: [item('string', null), item('file', null)] })).toEqual([]);
  expect(clipboardFiles({ items: [item('file', first), item('file', second), item('file', wrong)] })).toEqual([
    first,
    second,
    wrong,
  ]);
  expect(() => validateMaterialFile(wrong)).toThrow();
});

test('additive intake keeps the first five images and refuses PDF/image mixing in either direction', () => {
  const material = (kind: 'image' | 'pdf', name: string): ImportMaterial => ({
    source: { kind, name, pages: [] },
    pageCount: 1,
    render: async () => [],
    dispose: async () => {},
  });
  const held: ImportMaterial[] = [];
  for (let index = 0; index < MAX_EXTRACT_IMAGES; index++) {
    validateMaterialAddition('image', held);
    held.push(material('image', `${index}.png`));
  }
  expect(() => validateMaterialAddition('image', held)).toThrow('5');
  expect(held.map((image) => image.source.name)).toEqual(['0.png', '1.png', '2.png', '3.png', '4.png']);
  expect(() => validateMaterialAddition('pdf', held)).toThrow('Remove');
  held.splice(1, 1);
  expect(() => validateMaterialAddition('image', held)).not.toThrow();
  expect(held.map((image) => image.source.name)).toEqual(['0.png', '2.png', '3.png', '4.png']);
  const pdf = [material('pdf', 'book.pdf')];
  expect(() => validateMaterialAddition('image', pdf)).toThrow('Remove');
  expect(() => validateMaterialAddition('pdf', pdf)).toThrow('Remove');
  expect(() => validateMaterialAddition('pdf', [])).not.toThrow();
});
