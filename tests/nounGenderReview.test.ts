/** Owns the review CLI's id resolution: an id that names a noun, a rule or both, and one that names neither. */
import { expect, test } from 'bun:test';
import { resolveIds } from '../scripts/noun-gender/review';

const kept = [
  { id: 'age', lemma: 'âge', gender: 'm' },
  { id: 'maison', lemma: 'maison', gender: 'f' },
];
const row = (id: string) => ({
  id,
  ending: id,
  gender: 'm' as const,
  dictionary: { n: 10, agree: 10 },
  a1: { n: 3, agree: 3 },
  examples: ['a', 'b', 'c'],
  exceptions: [],
});
const rows = [row('age'), row('ment')];
const drops = ['eur: held by the owner (TEST); not shipped'];

test('an id spelled like both a noun and a rule names both, noun first', () => {
  expect(resolveIds(['age'], kept, rows, drops)).toEqual([{ noun: kept[0] }, { row: rows[0] }]);
});

test('an id that names only a noun or only a rule names just that one', () => {
  expect(resolveIds(['maison'], kept, rows, drops)).toEqual([{ noun: kept[1] }]);
  expect(resolveIds(['ment'], kept, rows, drops)).toEqual([{ row: rows[1] }]);
});

test('a repeated id is resolved once', () => {
  expect(resolveIds(['maison', 'maison'], kept, rows, drops)).toHaveLength(1);
});

test('a held or unknown id is its reason, which record refuses', () => {
  expect(resolveIds(['eur'], kept, rows, drops)).toEqual([{ text: drops[0] }]);
  expect(resolveIds(['zzz'], kept, rows, drops)).toEqual([{ text: 'zzz: rejected; skipped' }]);
});
