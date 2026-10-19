/**
 * The word sheet and the Conjugation page against the grammar pack: a pack verb shows the pack's table with no AI
 * conjugation request, any other verb a link to the Conjugation page, the reverse "Verb form" line names the
 * pack form that was tapped, a saved word carries no table, nothing moves when the pack arrives (360 px, long
 * text), and "Practise this verb" makes a set with no AI request. The AI is always mocked.
 */
import { parlerAnswer } from '../tests/fixtures/conjugationAnswer';
import { expect, layout, overflowing, settled, test, type MockAi } from './fixtures';
import type { Locator, Page } from '@playwright/test';

const ARTICLE = 'Je vais manger. Elle parle du pain. Quelle chose. Il faut aller.';

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

/** Opens the lookup of a word with the keyboard: a sentence's hover toolbar from an earlier tap can sit on top of a click. */
async function tap(page: Page, word: string) {
  const target = page.locator('article [data-reader-word]').filter({ hasText: new RegExp(`^${word}$`) });
  await target.focus();
  await target.press('Enter');
}

const sheet = (page: Page) => page.getByRole('dialog');
const tense = (page: Page, name: string) => sheet(page).getByRole('region', { name, exact: true });
/** The table is closed on arrival; this opens it from the disclosure and returns the disclosure. */
async function showTenses(page: Page) {
  const disclosure = sheet(page).getByRole('button', { name: 'Show all tenses' });
  await disclosure.click();
  await expect(sheet(page).getByRole('button', { name: 'Hide all tenses' })).toBeVisible();
  return sheet(page).getByRole('button', { name: /all tenses$/ });
}
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
  // Closed on arrival: the tenses are behind one disclosure.
  await expect(tense(page, 'Present')).toHaveCount(0);
  await showTenses(page);
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
  // French in the learner's language too: the tense and the pronoun as the verb is written.
  await expect(section.getByRole('listitem')).toHaveText(['aller : présent, je']);
  await expect(section.getByRole('listitem')).toHaveCount(1);
});

test('the Verb form line sits directly under the meaning, before every other section', async ({ page, ai }) => {
  ai.answer({
    word: wordAnswer('vais', 'aller', 'verbe', {
      phoneticsGuide: 'say it',
      contextTense: 'present',
      memoryTrick: 'a trick',
      usageExamples: [{ fr: 'Je vais bien.', en: 'I am well.', zh: 'x' }],
    }),
  });
  await openSeeded(page);
  await tap(page, 'vais');
  await expect(sheet(page).getByRole('heading', { name: 'vais' })).toBeVisible();
  const order = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')!;
    const top = (el: Element) => el.getBoundingClientRect().top;
    const meaning = [...dialog.querySelectorAll('p')].find((p) => p.textContent === 'meaning of vais')!;
    const headings = [...dialog.querySelectorAll('h4')].sort((a, b) => top(a) - top(b)).map((h) => h.textContent);
    return { headings, meaningAbove: top(meaning) < top(dialog.querySelector('h4')!) };
  });
  expect(order.meaningAbove).toBe(true);
  expect(order.headings).toEqual([
    'Verb form',
    'How to say it',
    'In this sentence',
    'Examples',
    'To remember',
    'Conjugation',
  ]);
});

test('the Verb form line is the same French text in Chinese', async ({ page, ai }) => {
  await page.addInitScript(() => localStorage.setItem('relire_lang', 'zh'));
  ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
  await openSeeded(page);
  await tap(page, 'vais');
  await expect(sheet(page).getByRole('listitem').filter({ hasText: 'aller' })).toHaveText(['aller : présent, je']);
});

test('the tapped form is marked in the opened table: semibold and a 2px underline, one cell, no other tense', async ({
  page,
  ai,
}) => {
  ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
  await openSeeded(page);
  await tap(page, 'vais');
  await showTenses(page);
  const marked = sheet(page).locator('[aria-current="true"]');
  await expect(marked).toHaveText(['je vais']);
  await expect(marked).toHaveCSS('font-weight', '600');
  await expect(marked).toHaveCSS('text-decoration-line', 'underline');
  await expect(marked).toHaveCSS('text-decoration-thickness', '2px');
  await expect(tense(page, 'Present').locator('[aria-current="true"]')).toHaveCount(1);
  await expect(tense(page, 'Imparfait').locator('[aria-current="true"]')).toHaveCount(0);
  // The other cells of the same tense carry no mark.
  await expect(tense(page, 'Present').getByText('tu vas', { exact: true })).toHaveCSS('font-weight', '400');
});

test('opened on the verb itself there is no reverse hit: the table stays closed and nothing is marked', async ({
  page,
  ai,
}) => {
  ai.answer({ word: wordAnswer('aller', 'aller', 'verbe') });
  await openSeeded(page);
  await tap(page, 'aller');
  await expect(sheet(page).getByRole('heading', { name: 'aller' })).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Verb form' })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Show all tenses' })).toBeVisible();
  await expect(tense(page, 'Present')).toHaveCount(0);
  await showTenses(page);
  await expect(tense(page, 'Present')).toBeVisible();
  await expect(sheet(page).locator('[aria-current="true"]')).toHaveCount(0);
});

test('the disclosure keeps its size when opened, and the Conjugation heading outranks the tense headings', async ({
  page,
  ai,
}) => {
  ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
  await openSeeded(page);
  await tap(page, 'vais');
  const closed = sheet(page).getByRole('button', { name: 'Show all tenses' });
  await expect(closed).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // The sheet slides in for 200 ms: measure from where it has come to rest.
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const before = await closed.boundingBox();
  const opened = await showTenses(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await opened.boundingBox()).toEqual(before);
  const heading = sheet(page).getByRole('heading', { name: 'Conjugation', level: 4 });
  await expect(heading).toHaveCSS('font-size', '16px');
  await expect(heading).toHaveCSS('font-weight', '600');
  await expect(tense(page, 'Present').getByRole('heading')).toHaveCSS('font-size', '14px');
  await expect(tense(page, 'Present').getByRole('heading')).toHaveCSS('font-weight', '500');
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
  // It reads as an action: an outline button-sized link with an arrow, 40 px high.
  expect((await link.boundingBox())!.height).toBe(40);
  await expect(link).toHaveCSS('border-top-width', '1px');
  await expect(link.locator('svg')).toBeVisible();
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
  ai.answer({
    word: (prompt: string) =>
      prompt.includes('French word "vais"')
        ? wordAnswer('vais', 'aller', 'verbe')
        : wordAnswer('parle', 'parler', 'verbe'),
  });
  await openSeeded(page);
  // A form of the pack first: it proves that both lazy sections and the pack have arrived and that the section does draw.
  await tap(page, 'vais');
  await expect(sheet(page).getByRole('heading', { name: 'Verb form' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);

  await tap(page, 'parle');
  await expect(sheet(page).getByRole('heading', { name: 'parle' })).toBeVisible();
  // Everything the pack gives is ready at once now, so the missing section is a real absence, not a late one.
  await expect(sheet(page).getByRole('link', { name: 'Conjugate this verb' })).toBeVisible();
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
  await showTenses(page);
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
    const h4 = (name: string) => [...dialog.querySelectorAll('h4')].find((h) => h.textContent === name) ?? null;
    return {
      title: top(dialog.querySelector('h2')),
      verbForm: top(h4('Verb form')),
      conjugation: top(h4('Conjugation')),
      save: top([...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes('Save word')) ?? null),
      page: document.documentElement.scrollWidth,
    };
  });

test('@phone the pack sections are in the first frame of the entry at 360 px with long text: no overflow, nothing moves', async ({
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
  // The analysis has arrived (the mock answers at once) but the pack has not: the sheet is still its loading
  // state, with none of the pack's sections and nothing half drawn.
  await expect(sheet(page).getByText('Looking up the word…')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(sheet(page).getByText('Looking up the word…')).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Conjugation' })).toHaveCount(0);
  await expect(sheet(page).getByRole('heading', { name: 'Verb form' })).toHaveCount(0);
  expect(ai.calls.word).toBe(1);
  // The sheet slides in for 200 ms: let it come to rest first.
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));

  await page.evaluate(() => document.fonts.ready);
  release();
  await expect(sheet(page).getByRole('heading', { name: 'vais' })).toBeVisible();
  // The entry's first frame: the Verb form line and the conjugation disclosure are already there.
  const first = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')!;
    return {
      verbForm: [...dialog.querySelectorAll('h4')].some((h) => h.textContent === 'Verb form'),
      disclosure: [...dialog.querySelectorAll('button')].some((b) => b.textContent?.includes('all tenses')),
    };
  });
  expect(first).toEqual({ verbForm: true, disclosure: true });
  const before = await anchors(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const after = await anchors(page);
  expect(after).toEqual(before);
  expect(Object.values(before).every(Number.isFinite)).toBe(true);
  expect(await overflowing(sheet(page))).toEqual([]);
  // Opening the table moves nothing above it: the heading keeps its distance to the disclosure, which does not move.
  const gap = () =>
    page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')!;
      const heading = [...dialog.querySelectorAll('h4')].find((h) => h.textContent === 'Conjugation')!;
      const button = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes('all tenses'))!;
      return Math.round(button.getBoundingClientRect().top - heading.getBoundingClientRect().top);
    });
  const gapBefore = await gap();
  await showTenses(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await gap()).toBe(gapBefore);
  expect(await overflowing(sheet(page))).toEqual([]);
  // Every tense of the verb is there and none is wider than the sheet.
  for (const name of ['Present', 'Passé composé', 'Imparfait', 'Future', 'Conditional', 'Subjunctive', 'Imperative'])
    await expect(tense(page, name)).toBeVisible();
  expect(await overflowing(page.locator('body'))).toEqual([]);
});

for (const module of ['data/grammar-pack/pack.json', 'components/word/packSections.ts']) {
  test(`a pack load error (${module}) shows its real text in the conjugation slot, in place`, async ({ page, ai }) => {
    ai.answer({ word: wordAnswer('vais', 'aller', 'verbe') });
    await page.route(`**/src/${module}*`, (route) => route.abort());
    await openSeeded(page);
    await tap(page, 'vais');
    await expect(sheet(page).getByRole('heading', { name: 'Conjugation' })).toBeVisible();
    await expect(sheet(page).getByRole('alert').first()).toBeVisible();
    await expect(sheet(page).getByRole('alert').first()).not.toBeEmpty();
    await expect(sheet(page).getByRole('alert').first()).toContainText('Failed to fetch dynamically imported module:');
    await expect(sheet(page).getByText('Looking up the word…')).toHaveCount(0);
    await expect(sheet(page).getByText('Conjugate this verb')).toHaveCount(0);
  });
}

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
      packVersions: unit.items.map((item) => typeof item.meta?.packVersion),
    }));
  });
  expect(units).toHaveLength(7);
  expect(new Set(units.map((unit) => unit.setId)).size).toBe(1);
  expect(units.map((unit) => unit.items)).toEqual(Array(7).fill(2));
  // A pack verb's items name the pack they came from, as the Practice entry's do.
  expect(units.flatMap((unit) => unit.packVersions)).toEqual(Array(14).fill('string'));
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
