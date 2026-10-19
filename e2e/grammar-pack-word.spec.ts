/**
 * The word sheet and the Conjugation page against the grammar pack: a pack verb shows the pack's table with no AI
 * conjugation request, any other verb a link to the Conjugation page, the reverse "Verb form" line names the
 * pack form that was tapped, a saved word carries no table, nothing moves when the pack arrives (360 px, long
 * text), and "Practise this verb" makes a set with no AI request. The AI is always mocked.
 */
import { parlerAnswer } from '../tests/fixtures/conjugationAnswer';
import { expect, layout, overflowing, settled, test, type MockAi } from './fixtures';
import type { Locator, Page } from '@playwright/test';

const ARTICLE = 'Je vais manger. Elle parle du pain. Quelle chose.';

/** A word answer in the shape the word task returns now: no conjugation table. */
const wordAnswer = (word: string, lemma: string, partOfSpeech: string, extra: Record<string, unknown> = {}) => ({
  word,
  lemma,
  partOfSpeech,
  ipa: '/test/',
  phoneticsGuide: '',
  translation: `meaning of ${word}`,
  otherMeanings: [],
  contextTense: '',
  usageExamples: [],
  cefrLevel: 'A1',
  memoryTrick: '',
  ...extra,
});

const noKey = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} })));

/** Saves a small article and opens it in the reader. */
async function openSeeded(page: Page) {
  await page.goto('/#/read');
  await page.evaluate(async (content) => {
    const { saveArticle } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    await saveArticle({
      id: 'verbs',
      title: 'Verbes',
      content,
      level: 'A1',
      category: '',
      createdAt: '2026-01-01',
    });
  }, ARTICLE);
  await page.goto('/#/read/verbs');
  await page.reload();
  await expect(page.locator('article [data-sentence]').first()).toBeVisible();
  await settled(page);
}

const tap = (page: Page, word: string) =>
  page
    .locator('article [data-reader-word]')
    .filter({ hasText: new RegExp(`^${word}$`) })
    .click();

const sheet = (page: Page) => page.getByRole('dialog');
const tense = (page: Page, name: string) => sheet(page).getByRole('region', { name, exact: true });
const totalCalls = (ai: MockAi) => Object.values(ai.calls).reduce((sum, count) => sum + count, 0);

test('a verb in the pack shows the pack table with no AI conjugation request, and no table is asked of the word task', async ({
  page,
  ai,
}) => {
  ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
  await openSeeded(page);
  await tap(page, 'vais');
  await expect(sheet(page).getByRole('heading', { name: 'vais' })).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Conjugation' })).toBeVisible();
  await expect(tense(page, 'Present').getByText('je vais', { exact: true })).toBeVisible();
  await expect(tense(page, 'Imperative').getByText('va', { exact: true })).toBeVisible();
  await expect(tense(page, 'Passé composé').getByText('je suis allé / suis allée', { exact: true })).toBeVisible();
  // The Conjugation page's own tense section, in its compact form: no "when it is used" lines.
  await expect(tense(page, 'Present').getByText('Standard', { exact: false })).toHaveCount(0);
  await expect(sheet(page).getByText('Conjugate this verb')).toHaveCount(0);
  expect(ai.calls.word).toBe(1);
  expect(ai.calls.conjugate).toBe(0);
  expect(ai.prompts.word[0]).not.toContain('conjugationTable');
});

test('tapping vais names the pack verb, tense and person', async ({ page, ai }) => {
  ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
  await openSeeded(page);
  await tap(page, 'vais');
  const section = sheet(page)
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Verb form' }) });
  await expect(section.getByRole('listitem')).toHaveText(['aller: Present, I']);
  await expect(section.getByRole('listitem')).toHaveCount(1);
});

test('a verb outside the pack shows one link; following it opens the Conjugation page with the verb', async ({
  page,
  ai,
}) => {
  ai.answer({ word: wordAnswer('parle', 'parler', 'verbe'), conjugate: parlerAnswer() });
  await openSeeded(page);
  await tap(page, 'parle');
  const link = sheet(page).getByRole('link', { name: 'Conjugate this verb' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '#/study/grammar/conjugation?verb=parler');
  await expect(tense(page, 'Present')).toHaveCount(0);
  expect(ai.calls.conjugate).toBe(0);

  await link.click();
  await expect(page).toHaveURL(/#\/study\/grammar\/conjugation\?verb=parler$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Verb in the infinitive')).toHaveValue('parler');
  await expect(page.getByRole('article', { name: 'parler' })).toBeVisible();
  expect(ai.calls.conjugate).toBe(1);
});

test('a word that is no pack form shows no Verb form section, not even a heading', async ({ page, ai }) => {
  ai.answer({ word: wordAnswer('parle', 'parler', 'verbe') });
  await openSeeded(page);
  await tap(page, 'parle');
  // Wait until the pack has been read: the slot has left its loading state, and the chunks are in.
  await expect(sheet(page).getByRole('link', { name: 'Conjugate this verb' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(sheet(page).getByRole('heading', { name: 'Verb form' })).toHaveCount(0);
});

test('a noun gets neither a conjugation section nor a link', async ({ page, ai }) => {
  void ai;
  await openSeeded(page);
  await tap(page, 'chose');
  await expect(sheet(page).getByRole('heading', { name: 'chose' })).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Conjugation' })).toHaveCount(0);
  await expect(sheet(page).getByRole('link', { name: 'Conjugate this verb' })).toHaveCount(0);
});

test('a saved pack verb carries no conjugation table', async ({ page, ai }) => {
  ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
  await openSeeded(page);
  await tap(page, 'vais');
  await expect(tense(page, 'Present')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Save word' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
        const rows = await (await db()).getAll('vocab');
        return rows.map((row) => ({ word: row.word, keys: Object.keys(row.analysis ?? {}) }));
      }),
    )
    .toEqual([expect.objectContaining({ word: 'vais' })]);
  const rows = await page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    return (await db()).getAll('vocab');
  });
  expect(JSON.stringify(rows)).not.toContain('conjugationTable');
});

/** Everything the learner sees at the top of the sheet: where it sits, so a late section cannot have moved it. */
const anchors = (page: Page) =>
  page.evaluate(() => {
    const top = (el: Element | null) => Math.round(el?.getBoundingClientRect().top ?? NaN);
    const dialog = document.querySelector('[role="dialog"]')!;
    const heading = [...dialog.querySelectorAll('h4')].find((h) => h.textContent === 'Conjugation') ?? null;
    return {
      title: top(dialog.querySelector('h2')),
      conjugation: top(heading),
      save: top([...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes('Save word')) ?? null),
      page: document.documentElement.scrollWidth,
    };
  });

test('@phone the pack table arrives in place at 360 px with long text: no overflow, nothing above it moves', async ({
  page,
  ai,
}) => {
  const long = 'unmotextrèslongsansaucunespacepourvérifierlecoupuredeligne'.repeat(2);
  ai.answer({
    word: wordAnswer('vais', 'aller', 'verbe', {
      translation: `${long} and a sentence long enough to wrap over several lines in the sheet`,
      otherMeanings: [long, long],
      phoneticsGuide: long,
      contextTense: long,
      memoryTrick: long,
    }),
  });
  // Hold the pack back, so the loading state can be measured before the table replaces it.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/grammar-pack\/pack\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await openSeeded(page);
  await tap(page, 'vais');
  await expect(sheet(page).getByRole('heading', { name: 'vais' })).toBeVisible();
  await expect(sheet(page).getByText('Loading the conjugation…')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // The sheet slides in for 200 ms: measure from where it has come to rest.
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const before = await anchors(page);

  release();
  await expect(tense(page, 'Present').getByText('je vais', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const after = await anchors(page);
  expect(after).toEqual(before);
  expect(await overflowing(sheet(page))).toEqual([]);
  // Every tense of the verb is there and none is wider than the sheet.
  for (const name of ['Present', 'Passé composé', 'Imparfait', 'Future', 'Conditional', 'Subjunctive', 'Imperative'])
    await expect(tense(page, name)).toBeVisible();
  expect(await overflowing(page.locator('body'))).toEqual([]);
});

test('a pack load error shows its real text in the conjugation slot, in place', async ({ page, ai }) => {
  ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
  await page.route(/grammar-pack\/pack\.json/, (route) => route.abort());
  await openSeeded(page);
  await tap(page, 'vais');
  await expect(sheet(page).getByRole('heading', { name: 'Conjugation' })).toBeVisible();
  await expect(sheet(page).getByRole('alert').first()).toBeVisible();
  await expect(sheet(page).getByRole('alert').first()).not.toBeEmpty();
  await expect(sheet(page).getByText('Conjugate this verb')).toHaveCount(0);
});

const PAGE = '/#/study/grammar/conjugation';
const practise = (page: Page) => page.getByRole('button', { name: /^(Practise this verb|Making exercises…)$/ });
const box = async (locator: Locator) => (await locator.boundingBox())!;

test('Practise this verb makes one set of seven tenses with no AI request, and links to it in place', async ({
  page,
  ai,
}) => {
  await noKey(page);
  await page.goto(`${PAGE}?verb=aller`);
  await expect(page.getByRole('article', { name: 'aller' })).toBeVisible();
  await settled(page);
  const button = practise(page);
  await expect(button).toBeVisible();
  const before = { page: await layout(page), button: await box(button) };

  await button.click();
  const link = page.getByRole('link', { name: 'Open the new exercise set' });
  await expect(link).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const after = { page: await layout(page), button: await box(practise(page)) };
  expect(after).toEqual(before);

  const units = await page.evaluate(async () => {
    const { listUnits } = (await import(
      '/src/storage/exercises.ts' as string
    )) as typeof import('../src/storage/exercises');
    return (await listUnits()).map((unit) => ({
      setId: unit.setId,
      tag: unit.grammarTags[0],
      items: unit.items.length,
    }));
  });
  expect(units).toHaveLength(7);
  expect(new Set(units.map((unit) => unit.setId)).size).toBe(1);
  expect(units.map((unit) => unit.items)).toEqual(Array(7).fill(2));
  await expect(link).toHaveAttribute('href', `#/practice/set/${units[0].setId}`);
  expect(totalCalls(ai)).toBe(0);

  await link.click();
  await expect(page).toHaveURL(new RegExp(`#/practice/set/${units[0].setId}$`));
});

test('Practise this verb is offered for a verb the rule checked, and not for one nothing could check', async ({
  page,
  ai,
}) => {
  ai.answer({ conjugate: parlerAnswer() });
  await page.goto(`${PAGE}?verb=parler`);
  await expect(page.getByRole('article', { name: 'parler' })).toBeVisible();
  await expect(practise(page)).toBeVisible();

  ai.answer({ conjugate: { ...parlerAnswer(), infinitive: 'chanter', rule: 'irregular' } });
  await page.getByLabel('Verb in the infinitive').fill('chanter');
  await page.getByRole('button', { name: 'Conjugate', exact: true }).click();
  await expect(page.getByText('AI-made, not checked').first()).toBeVisible();
  await expect(practise(page)).toHaveCount(0);
});
