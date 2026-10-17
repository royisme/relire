/** Notebook flows use the shared practice catalogue; all AI requests use fixtures. No visual artifacts. */
import type { Page } from '@playwright/test';
import { expect, layout, overflowing, settled, test } from './fixtures';
import { CATALOG_ANSWERS, CATALOG_EXPLANATION } from '../tests/fixtures/exerciseCatalog';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

type Storage = typeof import('../src/storage/exercises');
type Db = typeof import('../src/storage/db');
const NOTEBOOK = '/#/study/mistakes';
const PROMPT = 'Je ne [___] pas de pain (manger).';
const UNIT = 'unit-fill-blanks';
const TITLE = 'Conjuguer au présent et au futur';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function wrong(page: Page, unitId = UNIT, itemId = 'fb-1') {
  await page.evaluate(
    async ({ unitId, itemId, answer }) => {
      const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
      await storage.checkItem({
        unitId,
        itemId,
        answer: answer as never,
        resetToken: await storage.getResetToken(unitId),
        result: { correct: false },
      });
    },
    { unitId, itemId, answer: CATALOG_ANSWERS[itemId].wrong },
  );
}

async function notebook(page: Page) {
  await page.goto(NOTEBOOK);
  await expect(page.getByRole('heading', { name: 'Mistakes', exact: true })).toBeVisible();
}

const entry = (page: Page) => page.getByRole('listitem').filter({ hasText: PROMPT });

test.beforeEach(async ({ page, ai }) => {
  void ai;
  await seedUnits(page);
});

test('wrong answer → grouped notebook → explanation → actual word saved → vocabulary; retry keeps answers until confirmed reset, then resolves', async ({
  page,
  ai,
}) => {
  await openUnit(page, UNIT, TITLE);
  await row(page, 'Je ne').getByRole('textbox').fill('mangez');
  await checkButton(row(page, 'Je ne')).click();
  await expect(row(page, 'Je ne').getByText('Incorrect', { exact: true })).toBeAttached();
  await notebook(page);
  await expect(page.getByRole('region', { name: 'Verbs: forms' })).toBeVisible();
  await expect(entry(page)).toContainText('Present');
  await expect(entry(page)).toContainText('mangez');
  await expect(entry(page)).toContainText('To revisit');
  await entry(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByText(CATALOG_EXPLANATION.summary)).toBeVisible();
  expect(ai.prompts.explain[0]).toContain('Learner\'s answer: "mangez"');
  expect(ai.prompts.explain[0]).toContain('Expected answer: "mange"');
  expect(ai.prompts.explain[0]).toContain('Conjuguez le verbe');
  ai.answer({
    word: {
      word: 'pain',
      lemma: 'pain',
      partOfSpeech: 'nom',
      ipa: '/pɛ̃/',
      translation: 'bread',
      otherMeanings: [],
      contextTense: '',
      conjugationTable: [],
      usageExamples: [],
      cefrLevel: 'A1',
      memoryTrick: '',
      phoneticsGuide: '',
    },
  });
  await page.getByRole('dialog').getByRole('button', { name: 'pain', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save word' })).toBeVisible();
  expect(ai.prompts.word[0]).toContain('Sentence context: "Je ne [___] pas de pain (manger)."');
  expect(ai.prompts.word[0]).toContain('Conjuguez le verbe');
  expect(ai.prompts.word[0]).not.toContain('Un jour, le Petit Prince');
  await page.getByRole('button', { name: 'Save word' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('radio', { name: 'Words', exact: true }).click();
  await expect(page.getByText('pain', { exact: true }).first()).toBeVisible();
  await page.getByRole('radio', { name: 'Mistakes', exact: true }).click();
  await entry(page).getByRole('link', { name: 'Retry in unit' }).click();
  await expect(row(page, 'Je ne').getByRole('textbox')).toHaveValue('mangez');
  await expect(row(page, 'Je ne').getByRole('textbox')).not.toBeEditable();
  await page.getByRole('button', { name: 'Reset this unit', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await row(page, 'Je ne').getByRole('textbox').fill('mange');
  await checkButton(row(page, 'Je ne')).click();
  await page.goBack();
  await expect(entry(page)).toContainText('Resolved');
  await expect(entry(page)).toContainText('mangez');
  expect((await stored(page)).attempts).toHaveLength(2);
  await page.reload();
  await expect(entry(page)).toContainText('Resolved');
});

test('taxonomy order, deep links, reload and Back; deleting unit then material retains readable snapshots and removes links', async ({
  page,
  ai,
}) => {
  await wrong(page);
  await wrong(page, 'unit-word-transform', 'wt-1');
  await notebook(page);
  const headings = await page.locator('main h2').allTextContents();
  expect(headings).toEqual(['Adjectives and adverbs', 'Verbs: forms']);
  await entry(page).getByRole('link', { name: 'Open in material' }).click();
  await expect(page).toHaveURL(/#\/read\/petit-prince$/);
  await page.goBack();
  await expect(entry(page)).toBeVisible();
  await page.reload();
  await expect(entry(page)).toBeVisible();
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await storage.deleteUnit('unit-fill-blanks');
  });
  await expect(entry(page)).toContainText('Unit unavailable');
  await expect(entry(page).getByRole('link', { name: 'Retry in unit' })).toHaveCount(0);
  await expect(entry(page).getByRole('link', { name: 'Open in material' })).toBeVisible();
  await page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    await storage.deleteArticleData('petit-prince');
  });
  // App publishes article deletion through its own explicit state updates; reload obtains that state.
  await page.reload();
  await expect(entry(page)).toContainText('Material removed');
  await expect(entry(page).getByRole('link')).toHaveCount(0);
  await entry(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByText(CATALOG_EXPLANATION.summary)).toBeVisible();
  expect(ai.prompts.explain[0]).toContain(PROMPT);
  expect(ai.prompts.explain[0]).not.toContain('Context from the lesson');
});

test('empty notebook, real read error and query retry; mounted notifications refresh', async ({ page }) => {
  await notebook(page);
  await expect(page.getByText('No mistakes yet.', { exact: false })).toBeVisible();
  await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const original = d.getAllFromIndex.bind(d);
    let refuse = true;
    d.getAllFromIndex = ((...args: Parameters<typeof original>) => {
      if (args[0] === 'attempts' && refuse) {
        refuse = false;
        return Promise.reject(new Error('notebook disk refused'));
      }
      return original(...args);
    }) as typeof d.getAllFromIndex;
    const { exercisesChanged } = await import(/* @vite-ignore */ '/src/storage/exerciseEvents.ts' as string);
    exercisesChanged();
  });
  await expect(page.getByRole('alert')).toContainText('notebook disk refused');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No mistakes yet.', { exact: false })).toBeVisible();
  await wrong(page);
  await expect(entry(page)).toContainText('To revisit');
});

test('explanation failure retries real error; late reply after close or switching items cannot reopen or replace a sheet', async ({
  page,
  ai,
}) => {
  await wrong(page);
  await wrong(page, 'unit-word-transform', 'wt-1');
  await notebook(page);
  await settled(page);
  const before = await layout(page, 'main');
  ai.fail(['explain']);
  await entry(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('explain failed');
  expect(await layout(page, 'main')).toEqual(before);
  ai.fail([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText(CATALOG_EXPLANATION.summary)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  ai.answer({
    explain: async () => {
      await pause(700);
      return { summary: 'Late other item', details: 'Late details', tip: 'Late tip' };
    },
  });
  await page
    .getByRole('listitem')
    .filter({ hasText: 'intrigué' })
    .getByRole('button', { name: 'Explain', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Explaining…' })).toBeDisabled();
  const pressed = await page.getByRole('button', { name: 'Explaining…' }).boundingBox();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await entry(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByText(CATALOG_EXPLANATION.summary)).toBeVisible();
  await pause(900);
  await expect(page.getByText('Late other item')).toHaveCount(0);
  expect(pressed?.width).toBe(160);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('missing key enters the existing Settings return-to flow', async ({ page }) => {
  await wrong(page);
  await notebook(page);
  await page.evaluate(() => localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} })));
  await entry(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings\/text-ai$/);
  await expect(page.getByRole('button', { name: 'Go back to where you were' })).toBeDisabled();
  const key = page.getByLabel('Google Gemini API key', { exact: true });
  await expect(key).toBeFocused();
  await key.fill('TEST-RECONNECTED');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(page.getByText('Key works. Saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Go back to where you were' }).click();
  await expect(entry(page)).toContainText('To revisit');
});

for (const phone of [false, true]) {
  test(`long localized notebook fits all themes; explanation loading/error leaves page controls stable${phone ? ' @phone' : ''}`, async ({
    page,
    ai,
  }) => {
    await wrong(page);
    await page.evaluate(async () => {
      const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      const d = await db();
      const attempts = await d.getAll('attempts');
      await d.put('attempts', {
        ...attempts[0],
        prompt: attempts[0].prompt + ' anticonstitutionnellement'.repeat(16),
        userAnswer: 'caractéristiquement'.repeat(12),
      });
    });
    ai.fail(['explain']);
    for (const theme of ['light', 'sepia', 'dark']) {
      await page.addInitScript((value) => {
        localStorage.setItem('relire_theme', value);
        localStorage.setItem('relire_lang', 'zh');
      }, theme);
      await page.goto(NOTEBOOK);
      await page.reload();
      await expect(page.getByRole('heading', { name: '错题本', exact: true })).toBeVisible();
      await settled(page);
      expect(await overflowing(page.locator('main'))).toEqual([]);
      await settled(page);
      const before = await layout(page, 'main');
      await page
        .getByRole('listitem')
        .getByRole('button')
        .filter({ hasText: /讲解/ })
        .click();
      await expect(page.getByRole('alert')).toBeVisible();
      expect(await overflowing(page.getByRole('dialog'))).toEqual([]);
      expect(await layout(page, 'main')).toEqual(before);
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('older query cannot overwrite a refreshed resolution', async ({ page }) => {
  await wrong(page);
  await notebook(page);
  await expect(entry(page)).toContainText('To revisit');
  await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const original = d.getAllFromIndex.bind(d);
    let delay = true;
    d.getAllFromIndex = (async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      if (args[0] === 'attempts' && delay) {
        delay = false;
        await new Promise((r) => setTimeout(r, 800));
      }
      return result;
    }) as typeof d.getAllFromIndex;
    const { exercisesChanged } = await import(/* @vite-ignore */ '/src/storage/exerciseEvents.ts' as string);
    exercisesChanged();
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await storage.resetUnit('unit-fill-blanks');
    await storage.checkItem({
      unitId: 'unit-fill-blanks',
      itemId: 'fb-1',
      resetToken: await storage.getResetToken('unit-fill-blanks'),
      answer: { singleAnswer: 'mange', answers: [], selectedOptions: [], orderedItems: [] } as never,
      result: { correct: true },
    });
  });
  await expect(entry(page)).toContainText('Resolved');
  await pause(1000);
  await expect(entry(page)).toContainText('Resolved');
});

test('workbook without prose links to its own Practice, not an empty reader', async ({ page }) => {
  await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const material = await d.get('articles', 'petit-prince');
    await d.put('articles', { ...material!, kind: 'workbook', content: '' });
  });
  await wrong(page);
  await notebook(page);
  await page.reload();
  await entry(page).getByRole('link', { name: 'Open in material' }).click();
  await expect(page).toHaveURL(/#\/practice\?article=petit-prince$/);
  await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();
});

test('late explanation is dropped after unmount', async ({ page, ai }) => {
  await wrong(page);
  await notebook(page);
  ai.answer({
    explain: async () => {
      await pause(700);
      return { summary: 'Unmounted answer', details: 'Not shown', tip: 'Not shown' };
    },
  });
  await entry(page).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect.poll(() => ai.calls.explain).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Words', exact: true }).click();
  await pause(900);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Mistakes', exact: true }).click();
  await expect(page.getByText('Unmounted answer')).toHaveCount(0);
});
