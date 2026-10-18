/**
 * Locale coverage of the conjugation framework copy: every tense, person and regular rule family has its
 * labels in both languages. The keys are built dynamically (`conjugation.tenses.<tense>.name`), which
 * scripts/check-i18n.ts does not see, so this test is their check. Owns nothing else.
 */
import { expect, test } from 'bun:test';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { FINITE_PERSONS, RuleIdSchema, TENSES } from '../src/types/grammarPack';

const regularRules = RuleIdSchema.options.filter((rule) => rule !== 'irregular');

for (const [language, locale] of [
  ['en', en],
  ['zh', zh],
] as const) {
  const copy = locale.conjugation as {
    tenses: Record<string, { name: string; use: string; form: string }>;
    rules: Record<string, string>;
    persons: Record<string, string>;
  };

  test(`${language}: every tense has a name, a use line and a form line`, () => {
    for (const tense of TENSES)
      for (const field of ['name', 'use', 'form'] as const) expect(copy.tenses[tense]?.[field]?.trim()).toBeTruthy();
    expect(Object.keys(copy.tenses).sort()).toEqual([...TENSES].sort());
  });

  test(`${language}: every regular rule family has a caption and no other key exists`, () => {
    for (const rule of regularRules) expect(copy.rules[rule]?.trim()).toBeTruthy();
    expect(Object.keys(copy.rules).sort()).toEqual([...regularRules].sort());
  });

  test(`${language}: every person has a label`, () => {
    for (const person of FINITE_PERSONS) expect(copy.persons[person]?.trim()).toBeTruthy();
    expect(Object.keys(copy.persons).sort()).toEqual([...FINITE_PERSONS].sort());
  });

  test(`${language}: the copy uses the typographic apostrophe and no exclamation marks`, () => {
    const all = JSON.stringify(copy);
    expect(all.includes("'")).toBe(false);
    expect(all.includes('!')).toBe(false);
  });
}
