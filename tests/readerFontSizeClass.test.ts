/** The extracted reader font mapping keeps every existing preference's rendered text size. */
import { expect, test } from 'bun:test';
import { readerFontSizeClass } from '../src/components/reader/readerFontSizeClass';

test.each([
  ['sm', 'text-[17px]'],
  ['base', 'text-[19px]'],
  ['lg', 'text-[21px]'],
  ['xl', 'text-2xl'],
] as const)('%s keeps its reader text class', (fontSize, className) => {
  expect(readerFontSizeClass(fontSize)).toBe(className);
});
