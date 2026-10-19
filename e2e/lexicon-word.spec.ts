/**
 * The word sheet against the lexicon of the content service (a fake one with TEST data): a tapped form of a verb
 * outside the pack names its verb, tense and person, and the conjugation slot shows the dictionary's simple
 * tenses, marked as not reviewed. A word the lexicon does not have, or no answer, leaves what the sheet showed
 * before; a failure shows its real text without breaking the sheet; the cached copy serves a lost connection;
 * nothing moves when the lexicon answers late. The AI is always mocked.
 */
import { chanterLemma, formOf } from '../tests/fixtures/lexicon';
import { mockLexicon } from './contentService.helpers';
import { expect, overflowing, settled, test } from './fixtures';
import type { Page } from '@playwright/test';

const ARTICLE = 'Nous chantons une chanson. Elle chante bien.';

const wordAnswer = (word: string, lemma: string, partOfSpeech: string) => ({
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
});

/** The fake lexicon knows `chanter` and the forms `chantons` and `chante`; anything else is its 404. */
const lexicon = (page: Page) =>
  mockLexicon(page, {
    forms: {
      chantons: formOf('chantons', { lemma: 'chanter', pos: 'verb' }),
      chante: formOf('chante', { lemma: 'chanter', pos: 'verb' }),
    },
    lemmas: { chanter: chanterLemma() },
  });

async function openSeeded(page: Page) {
  await page.goto('/#/read');
  await page.evaluate(async (content) => {
    const { saveArticle } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    await saveArticle({ id: 'chant', title: 'Chant', content, level: 'A1', category: '', createdAt: '2026-01-01' });
  }, ARTICLE);
  await page.goto('/#/read/chant');
  await page.reload();
  await expect(page.locator('article [data-sentence]').first()).toBeVisible();
  await settled(page);
}

async function tap(page: Page, word: string) {
  const target = page.locator('article [data-reader-word]').filter({ hasText: new RegExp(`^${word}$`) });
  await target.focus();
  await target.press('Enter');
}

const sheet = (page: Page) => page.getByRole('dialog');
const tense = (page: Page, name: string) => sheet(page).getByRole('region', { name, exact: true });
const verbForm = (page: Page) =>
  sheet(page)
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Verb form' }) });

test('tapping a form of a verb outside the pack names it and shows the dictionary table with the form marked', async ({
  page,
  ai,
}) => {
  const lex = await lexicon(page);
  ai.answer({ word: wordAnswer('chantons', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chantons');
  await expect(sheet(page).getByRole('heading', { name: 'chantons' })).toBeVisible();
  await expect(verbForm(page).getByRole('listitem')).toHaveText(['chanter : présent, nous; impératif, nous']);
  // The table is behind the disclosure; the link to the Conjugation page is not the only thing there.
  await expect(sheet(page).getByRole('link', { name: 'Conjugate this verb' })).toHaveCount(0);
  await expect(tense(page, 'Present')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Show all tenses' }).click();
  await expect(sheet(page).getByText('From the Morphalou dictionary, not reviewed.')).toBeVisible();
  await expect(tense(page, 'Present').getByRole('row')).toHaveCount(6);
  await expect(tense(page, 'Present').getByRole('cell', { name: 'chantons', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(tense(page, 'Present').getByRole('cell', { name: 'nous', exact: true })).toBeVisible();
  await expect(tense(page, 'Imperative').getByRole('row')).toHaveCount(3);
  // The imperative takes no subject pronoun, and the tapped cell is the only mark in each tense.
  await expect(tense(page, 'Imperative').getByRole('cell')).toHaveText(['chante', 'chantons', 'chantez']);
  await expect(sheet(page).locator('[aria-current="true"]')).toHaveCount(2);
  // No compound tense is made up: only a pointer to the page that has them.
  await expect(tense(page, 'Passé composé')).toHaveCount(0);
  await expect(sheet(page).getByRole('link', { name: 'Compound tenses are on the Conjugation page.' })).toHaveAttribute(
    'href',
    '#/study/grammar/conjugation?verb=chanter',
  );
  expect(ai.calls.conjugate).toBe(0);
  expect(await overflowing(sheet(page))).toEqual([]);
  expect(lex.paths).toEqual(['/v1/lexicon/form/chantons', '/v1/lexicon/chanter']);
});

test('a form that is several cells lists them all', async ({ page, ai }) => {
  await lexicon(page);
  ai.answer({ word: wordAnswer('chante', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chante');
  await expect(verbForm(page).getByRole('listitem')).toHaveText([
    'chanter : présent, je / il/elle; subjonctif, je / il/elle; impératif, tu',
  ]);
});

test("a word the lexicon does not have leaves today's link and no Verb form section", async ({ page, ai }) => {
  ai.answer({ word: wordAnswer('chantons', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chantons');
  await expect(sheet(page).getByRole('heading', { name: 'chantons' })).toBeVisible();
  const link = sheet(page).getByRole('link', { name: 'Conjugate this verb' });
  await expect(link).toHaveAttribute('href', '#/study/grammar/conjugation?verb=chanter');
  expect((await link.boundingBox())!.height).toBe(40);
  await expect(sheet(page).getByRole('heading', { name: 'Verb form' })).toHaveCount(0);
  await expect(sheet(page).getByRole('alert')).toHaveCount(0);
});

test('the form is known but the lemma is not: the Verb form section is absent and the link stays', async ({
  page,
  ai,
}) => {
  await mockLexicon(page, { forms: { chantons: formOf('chantons', { lemma: 'chanter', pos: 'verb' }) } });
  ai.answer({ word: wordAnswer('chantons', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chantons');
  await expect(sheet(page).getByRole('link', { name: 'Conjugate this verb' })).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Verb form' })).toHaveCount(0);
});

test('a lexicon HTTP 500 shows its real text where it was asked and leaves the sheet working', async ({ page, ai }) => {
  const lex = await lexicon(page);
  lex.mode = 'error';
  ai.answer({ word: wordAnswer('chantons', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chantons');
  await expect(sheet(page).getByRole('heading', { name: 'chantons' })).toBeVisible();
  await expect(verbForm(page).getByRole('alert')).toHaveText('HTTP 500: unavailable');
  await expect(sheet(page).getByRole('alert')).toHaveText(['HTTP 500: unavailable', 'HTTP 500: unavailable']);
  // The Conjugation page is still one click away, and the rest of the sheet is intact.
  await expect(sheet(page).getByRole('link', { name: 'Conjugate this verb' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Save word' })).toBeVisible();
  expect(await overflowing(sheet(page))).toEqual([]);
});

test('after one load a lost connection is served from the cached copy', async ({ page, ai }) => {
  const lex = await lexicon(page);
  ai.answer({ word: wordAnswer('chantons', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chantons');
  await expect(verbForm(page).getByRole('listitem')).toHaveText(['chanter : présent, nous; impératif, nous']);
  await expect(sheet(page).getByRole('button', { name: 'Show all tenses' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(sheet(page)).toHaveCount(0);
  lex.mode = 'offline';
  await tap(page, 'chantons');
  await expect(verbForm(page).getByRole('listitem')).toHaveText(['chanter : présent, nous; impératif, nous']);
  await sheet(page).getByRole('button', { name: 'Show all tenses' }).click();
  await expect(tense(page, 'Present').getByRole('cell', { name: 'chantons', exact: true })).toBeVisible();
  await expect(sheet(page).getByRole('alert')).toHaveCount(0);
  // A word never loaded has no copy: the real reason shows.
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).first().click();
  ai.answer({ word: wordAnswer('chante', 'chanter', 'verbe') });
  await tap(page, 'chante');
  await expect(verbForm(page).getByRole('alert')).toBeVisible();
});

/** Tops and size of what the entry's first frame already holds. */
const anchors = (page: Page) =>
  sheet(page).evaluate((dialog) => {
    const top = (el: Element | null) => Math.round(el?.getBoundingClientRect().top ?? NaN);
    const heading = (name: string) => [...dialog.querySelectorAll('h4')].find((h) => h.textContent === name) ?? null;
    const button = (name: string) =>
      [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes(name)) ?? null;
    const box = dialog.getBoundingClientRect();
    return {
      sheet: { x: box.x, y: box.y, width: box.width, height: box.height },
      title: top(dialog.querySelector('h2')),
      verbForm: top(heading('Verb form')),
      conjugation: top(heading('Conjugation')),
      slot: top(dialog.querySelector('[class*="min-h-10"]')),
      save: top(button('Save word')),
    };
  });

for (const phone of [false, true]) {
  test(`the sheet waits for the lexicon, so nothing shifts when it answers, on a first and a second open ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    const lex = await lexicon(page);
    ai.answer({ word: wordAnswer('chantons', 'chanter', 'verbe') });
    await openSeeded(page);
    for (const round of [1, 2]) {
      let release!: () => void;
      let releaseLemma!: () => void;
      const formGate = new Promise<void>((done) => (release = done));
      const slotGate = new Promise<void>((done) => (releaseLemma = done));
      // The form answer is held; so is the slot's own lemma request (the second one, after the sheet's).
      lex.hold = (path, nth) =>
        path.includes('/form/') ? formGate : path === '/v1/lexicon/chanter' && nth % 2 === 0 ? slotGate : undefined;
      await tap(page, 'chantons');
      // The AI has answered, the lexicon has not: the entry is not drawn yet.
      await expect.poll(() => lex.paths.filter((path) => path.includes('/form/')).length).toBe(round);
      await page.waitForTimeout(300);
      await expect(sheet(page).getByRole('heading', { name: 'chantons' })).toHaveCount(0);
      expect(ai.calls.word).toBe(1);
      release();
      // The entry's first frame already holds the Verb form line, and the slot says it is loading.
      await expect(sheet(page).getByRole('heading', { name: 'chantons' })).toBeVisible();
      const first = await anchors(page);
      expect(first.verbForm).not.toBeNaN();
      expect(first.slot).not.toBeNaN();
      await expect(sheet(page).getByText('Loading the conjugation…')).toBeVisible();
      await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
      const loading = await anchors(page);
      releaseLemma();
      await expect(sheet(page).getByRole('button', { name: 'Show all tenses' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const after = await anchors(page);
      expect(after).toEqual(loading);
      expect(after.verbForm).toBe(first.verbForm);
      expect(after.sheet.height).toBe(first.sheet.height);
      expect(await overflowing(sheet(page))).toEqual([]);
      await sheet(page).getByRole('button', { name: 'Close', exact: true }).first().click();
      await expect(sheet(page)).toHaveCount(0);
    }
  });
}

test("the Verb form line and the table speak the learner's language at 360 px @phone", async ({ page, ai }) => {
  await page.addInitScript(() => localStorage.setItem('relire_lang', 'zh'));
  await lexicon(page);
  ai.answer({ word: wordAnswer('chantons', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chantons');
  await expect(sheet(page).getByRole('listitem').filter({ hasText: 'chanter' })).toHaveText([
    'chanter : présent, nous; impératif, nous',
  ]);
  await sheet(page).getByRole('button', { name: '显示全部时态' }).click();
  await expect(sheet(page).getByText('来自 Morphalou 词典，未经人工审核。')).toBeVisible();
  await expect(sheet(page).getByRole('link', { name: '复合时态在“动词变位”页面。' })).toBeVisible();
  expect(await overflowing(sheet(page))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('About names the data source only when a content service is configured', async ({ page }) => {
  await page.goto('/#/about');
  await expect(page.getByText(/Morphalou 3\.1, maintained by ATILF/)).toBeVisible();
  await expect(page.getByText(/licensed LGPL-LR/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Morphalou 3.1 source' })).toHaveAttribute(
    'href',
    'http://www.cnrtl.fr/lexiques/morphalou/',
  );
  await expect(page.getByRole('link', { name: 'How to rebuild it' })).toHaveAttribute(
    'href',
    /\/blob\/main\/worker\/NOTICE\.md$/,
  );
});
