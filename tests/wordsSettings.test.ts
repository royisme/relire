/** Settings → Words: the daily limit accepts only a whole number 0..100 and saves through the shared model. */
import { expect, test } from 'bun:test';
import { parseNewPerDay } from '../src/components/settings/WordsSection';

test('the new-word limit accepts 0..100 whole numbers and rejects everything else without clamping', () => {
  for (const value of ['0', '1', '20', '99', '100']) expect(parseNewPerDay(value)).toBe(Number(value));
  for (const value of ['', ' ', '-1', '101', '1.5', '1e2', ' 20', '20 ', '20a', 'abc'])
    expect(parseNewPerDay(value)).toBeNull();
});
