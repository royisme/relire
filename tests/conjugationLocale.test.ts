/**
 * Locale coverage of the conjugation framework copy: every tense, person and regular rule family has its
 * labels in both languages. The keys are built dynamically (`conjugation.tenses.<tense>.name`), which
 * scripts/check-i18n.ts does not see, so this test is their check. Owns nothing else.
 */
import { expect, test } from 'bun:test';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { FINITE_PERSONS, RuleIdSchema, TENSES } from '../src/types/grammarPack';

/** Every string of a nested object with its dotted path. */
const leaves = (value: unknown, prefix = ''): [string, string][] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) => leaves(child, `${prefix}${key}.`))
    : [[prefix.slice(0, -1), String(value)]];
const paths = (value: unknown) => leaves(value).map(([path]) => path);

const STATUSES = ['pack-reviewed', 'rule-checked', 'partly-differs', 'ai-only'];

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

  test(`${language}: the Conjugation page has every label, status line and participle name`, () => {
    const page = (locale.conjugation as { page: Record<string, unknown> }).page;
    for (const [, text] of leaves(page)) expect(text.trim()).toBeTruthy();
    const status = page.status as Record<string, { label: string; note: string }>;
    expect(Object.keys(status).sort()).toEqual([...STATUSES].sort());
    expect(Object.keys(page.participle as object).sort()).toEqual(['fp', 'fs', 'mp', 'ms', 'present']);
    expect(Object.keys(page.auxiliary as object).sort()).toEqual(['avoir', 'etre']);
    expect(locale.study.grammar.trim()).toBeTruthy();
  });

  test(`${language}: the copy uses the typographic apostrophe and no exclamation marks`, () => {
    const all = JSON.stringify(copy);
    expect(all.includes("'")).toBe(false);
    expect(all.includes('!')).toBe(false);
  });
}

test('the Conjugation page has the same keys in en and zh', () => {
  expect(paths(zh.conjugation.page).sort()).toEqual(paths(en.conjugation.page).sort());
});
