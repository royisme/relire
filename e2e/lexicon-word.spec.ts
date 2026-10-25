/**
 * The word sheet against the dictionary that ships with the app (the committed Morphalou data file, no content
 * service configured): a tapped form of a verb outside the reviewed pack names its verb, tense and person, and the
 * conjugation slot shows the dictionary's simple tenses, marked as not reviewed. A word the dictionary does not have
 * leaves what the sheet showed before, with the Conjugation page one click away. The AI is always mocked.
 */
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

async function openSeeded(page: Page, article = ARTICLE) {
  await page.goto('/#/read');
  await page.evaluate(async (content) => {
    const { saveArticle } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    await saveArticle({ id: 'chant', title: 'Chant', content, level: 'A1', category: '', createdAt: '2026-01-01' });
  }, article);
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

test('tapping a form of a verb outside the pack names it and shows the bundled dictionary table with the form marked', async ({
  page,
  ai,
}) => {
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
    '#/grammar/conjugation?verb=chanter',
  );
  expect(ai.calls.conjugate).toBe(0);
  expect(await overflowing(sheet(page))).toEqual([]);
});

test('a form that is several cells lists them all', async ({ page, ai }) => {
  ai.answer({ word: wordAnswer('chante', 'chanter', 'verbe') });
  await openSeeded(page);
  await tap(page, 'chante');
  await expect(verbForm(page).getByRole('listitem')).toHaveText([
    'chanter : présent, je / il/elle; subjonctif, je / il/elle; impératif, tu',
  ]);
});

test("a word the dictionary does not have leaves today's link and no Verb form section", async ({ page, ai }) => {
  ai.answer({ word: wordAnswer('xyzzy', 'xyzzy', 'verbe') });
  await openSeeded(page, 'Nous xyzzy une chanson.');
  await tap(page, 'xyzzy');
  await expect(sheet(page).getByRole('heading', { name: 'xyzzy' })).toBeVisible();
  await expect(sheet(page).getByRole('link', { name: 'Conjugate this verb' })).toHaveAttribute(
    'href',
    '#/grammar/conjugation?verb=xyzzy',
  );
  await expect(sheet(page).getByRole('heading', { name: 'Verb form' })).toHaveCount(0);
  await expect(sheet(page).getByRole('alert')).toHaveCount(0);
});

test("the Verb form line and the table speak the learner's language at 360 px @phone", async ({ page, ai }) => {
  await page.addInitScript(() => localStorage.setItem('relire_lang', 'zh'));
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

test('About names the dictionary and links its local notice and licence with no content service configured', async ({
  page,
}) => {
  await page.goto('/#/about');
  await expect(page.getByText(/Morphalou 3\.1, maintained by ATILF/)).toBeVisible();
  await expect(page.getByText(/licensed LGPL-LR/)).toBeVisible();
  await expect(page.getByText(/ships with the app and needs no service/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Morphalou 3.1 source' })).toHaveAttribute(
    'href',
    'http://www.cnrtl.fr/lexiques/morphalou/',
  );
  await expect(page.getByRole('link', { name: 'How to rebuild or replace it' })).toHaveAttribute(
    'href',
    /\/data\/lexicon\/NOTICE\.md/,
  );
  await expect(page.getByRole('link', { name: 'LGPL-LR licence text' })).toHaveAttribute(
    'href',
    /\/data\/lexicon\/LGPL-LR\.txt/,
  );
});
