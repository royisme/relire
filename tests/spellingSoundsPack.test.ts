/** The committed letter-sounds pack: it parses, passes the gate with the real locale notes, and carries honest AI review labels. */
import { expect, test } from 'bun:test';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import pack from '../src/data/spelling-sounds/patterns.json';
import { checkPatterns } from '../scripts/spelling-sounds/build';
import { SpellingSoundsPackSchema } from '../src/types/spellingSounds';

const notes = { en: en.spellingSounds.notes, zh: zh.spellingSounds.notes } as Record<string, Record<string, string>>;

test('the committed pack parses and every pattern passes the gate with the real notes', () => {
  const parsed = SpellingSoundsPackSchema.parse(pack);
  const rows = parsed.patterns.map(({ review: _review, ...row }) => row);
  expect(checkPatterns(rows, { en: notes.en, zh: notes.zh })).toEqual([]);
});

test('no pattern claims a human review the project has not recorded', () => {
  const parsed = SpellingSoundsPackSchema.parse(pack);
  expect(parsed.patterns.length).toBeGreaterThan(0);
  for (const row of parsed.patterns) {
    expect(row.review.kind).toBe('ai');
    expect(row.review.by.startsWith('AI review:')).toBe(true);
  }
  expect(JSON.stringify(pack)).not.toMatch(/"status"\s*:\s*"reviewed"/);
});
