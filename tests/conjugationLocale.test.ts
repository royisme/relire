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
const drillCopy = (locale: typeof en | typeof zh): Record<string, string> =>
  (locale.conjugation as { drill: Record<string, string> }).drill;

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
    expect(locale.learning.areas.grammar.trim()).toBeTruthy();
  });

  test(`${language}: the copy uses the typographic apostrophe and no exclamation marks`, () => {
    const all = JSON.stringify(copy);
    expect(all.includes("'")).toBe(false);
    expect(all.includes('!')).toBe(false);
  });
}

test('the drill copy has the same key set in both locales, none blank', () => {
  const enDrill = drillCopy(en);
  const zhDrill = drillCopy(zh);
  expect(Object.keys(zhDrill).sort()).toEqual(Object.keys(enDrill).sort());
  for (const value of [...Object.values(enDrill), ...Object.values(zhDrill)]) expect(value.trim()).toBeTruthy();
});

test('the Conjugation page has the same keys in en and zh', () => {
  expect(paths(zh.conjugation.page).sort()).toEqual(paths(en.conjugation.page).sort());
});

test('the word sheet has the same new keys in en and zh, none blank', () => {
  const keys = ['conjugation', 'conjugationLoading', 'conjugateThis', 'verbForm', 'verbFormLine', 'verbFormTense'];
  for (const locale of [en, zh])
    for (const key of keys) expect((locale.wordModal as Record<string, string>)[key]?.trim()).toBeTruthy();
  // The two pattern keys keep their placeholders in both languages.
  for (const locale of [en, zh]) {
    expect(locale.wordModal.verbFormLine).toContain('{{verb}}');
    expect(locale.wordModal.verbFormLine).toContain('{{forms}}');
    expect(locale.wordModal.verbFormTense).toContain('{{tense}}');
    expect(locale.wordModal.verbFormTense).toContain('{{persons}}');
  }
  expect('clickToListen' in en.wordModal).toBe(false);
  expect('clickToListen' in zh.wordModal).toBe(false);
});

for (const [language, locale] of [
  ['en', en],
  ['zh', zh],
] as const) {
  test(`CP6 locale ${language}: fixed pattern rows and reasons`, () => {
    const copy = locale.conjugation.page.patterns;
    expect({
      keys: Object.entries(copy)
        .filter(([, text]) => text.trim())
        .map(([key]) => key)
        .sort(),
      names: language === 'en' ? [copy.negation, copy.estCeQue, copy.inversion] : copy.negation,
      unavailable: copy.unavailable,
    }).toEqual({
      keys: [
        'title',
        'tense',
        'person',
        'impersonal',
        'on',
        'negation',
        'estCeQue',
        'inversion',
        'unavailable',
        'noQuestions',
        'noJe',
        'notCovered',
        'aiOnly',
        'differs',
      ].sort(),
      names: language === 'en' ? ['Negation', 'Question with est-ce que', 'Question with inversion'] : '否定句',
      unavailable: '— {{reason}}',
    });
  });
}

test('the Conjugation page practise button copy exists in both locales', () => {
  for (const { practise, practising, practiseOpen } of [en.conjugation.page, zh.conjugation.page])
    for (const text of [practise, practising, practiseOpen]) expect(text.trim()).toBeTruthy();
});
