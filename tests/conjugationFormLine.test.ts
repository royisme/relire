/**
 * When a tense's generic "how it is formed" line may be shown on the Conjugation page: only when it is true for
 * the verb's rule. Owns that predicate's matrix and the two locales' French line labels. Does not own the page.
 */
import { expect, test } from 'bun:test';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { showsFormLine } from '../src/components/study/grammar/forms';
import { FINITE_PERSONS, RuleIdSchema, TENSES } from '../src/types/grammarPack';

const ER_ONLY = ['present', 'imperatif'] as const;

test('an irregular verb or an unknown rule never gets a form line', () => {
  for (const tense of TENSES) {
    expect(showsFormLine(tense, 'irregular')).toBe(false);
    expect(showsFormLine(tense, undefined)).toBe(false);
  }
});

test('the present and imperatif lines speak of -er endings, so only an er- rule shows them', () => {
  for (const rule of RuleIdSchema.options.filter((name) => name !== 'irregular'))
    for (const tense of ER_ONLY) expect(showsFormLine(tense, rule)).toBe(rule.startsWith('er-'));
});

test('the other tenses show their form line for every regular rule', () => {
  for (const rule of RuleIdSchema.options.filter((name) => name !== 'irregular'))
    for (const tense of TENSES.filter((name) => !ER_ONLY.includes(name as (typeof ER_ONLY)[number])))
      expect(showsFormLine(tense, rule)).toBe(true);
});

test('the French person and tense labels are the same in both locales', () => {
  expect(zh.conjugation.pronouns).toEqual(en.conjugation.pronouns);
  expect(zh.conjugation.tenseFr).toEqual(en.conjugation.tenseFr);
  expect(Object.keys(en.conjugation.pronouns).sort()).toEqual([...FINITE_PERSONS].sort());
  expect(Object.keys(en.conjugation.tenseFr).sort()).toEqual([...TENSES].sort());
  expect(zh.wordModal.verbFormLine).toBe(en.wordModal.verbFormLine);
  expect(zh.wordModal.verbFormTense).toBe(en.wordModal.verbFormTense);
});
