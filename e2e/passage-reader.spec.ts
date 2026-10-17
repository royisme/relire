/** Distinct stored passages use the existing Reader, with all AI and speech mocked. */
import { expect, test, layout, overflowing, settled } from './fixtures';
import {
  title,
  content,
  prepare,
  chooseSentence,
  plays,
  trackPlayback,
  type Exercises,
  type Db,
} from './passage.helpers';
test.beforeEach(async ({ page, ai }) => {
  ai.ttsDelayMs = 30;
  await trackPlayback(page);
});
/** Opening words of the material's own prose (`src/data/sampleArticles.ts`): a passage prompt must never carry them. */
const materialProse = "C'est une chose trop oubliée, dit le renard.";
for (const phone of [false, true]) {
  for (const blank of [false, true]) {
    test(`passage link reads the exact distinct stored text with ${blank ? 'empty' : 'different'} material, Back and reload ${phone ? '@phone' : ''}`, async ({
      page,
      ai,
    }) => {
      await page.addInitScript(
        (theme) => localStorage.setItem('relire_theme', theme),
        blank ? 'dark' : phone ? 'sepia' : 'light',
      );
      await prepare(page, blank);
      const storedSource = () =>
        page.evaluate(async () => {
          const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
          const d = await db();
          return JSON.stringify([await d.getAll('articles'), await d.getAll('units')]);
        });
      const sourceBefore = await storedSource();
      await page.getByRole('link', { name: 'Open in the reader' }).click();
      await expect(page).toHaveURL(/#\/passage\/petit-prince\/unit-reading-cloze$/);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      const text = page.locator('article [data-sentence]');
      await expect(text).toHaveText(['Nous visitons le jardin. ', 'Les oiseaux chantent dans les arbres.']);
      await expect(page.getByRole('link', { name: 'Make exercises' })).toHaveCount(0);
      await settled(page);
      const before = await layout(page, 'article');
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await expect.poll(() => ai.calls.tts).toBeGreaterThan(0);
      await expect.poll(() => plays(page)).toContain('reference');
      await page.keyboard.press('Escape');
      expect((await layout(page, 'article')).top).toBe(before.top);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      await page.reload();
      await expect(text).toHaveCount(2);
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'Compléter le passage', exact: true })).toBeVisible();
      await page.goForward();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Back to exercises' }).click();
      await expect(page).toHaveURL(/#\/practice\/unit-reading-cloze$/);
      expect(await storedSource()).toBe(sourceBefore);
    });
  }

  test(`passage word and sentence analyses use only passage context and discard late source replies ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    // The material keeps its own (different) prose, so "not the material" below can actually fail.
    await prepare(page);
    await page.getByRole('link', { name: 'Open in the reader' }).click();
    await page.locator('article').getByRole('button', { name: 'jardin', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(() => ai.prompts.word.length).toBe(1);
    expect(ai.prompts.word[0]).toContain(content);
    expect(ai.prompts.word[0]).not.toContain(materialProse);
    await page.keyboard.press('Escape');
    await chooseSentence(page);
    const analyze = page.getByRole('button', { name: 'Explain sentence', exact: true });
    await analyze.click();
    await expect.poll(() => ai.prompts.sentence.length).toBe(1);
    expect(ai.prompts.sentence[0]).toContain(content);
    expect(ai.prompts.sentence[0]).not.toContain(materialProse);
    await page.keyboard.press('Escape');
    ai.answer({
      sentence: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { invalid: true };
      },
    });
    await chooseSentence(page);
    // A different sentence avoids the cached first request.
    await page.locator('article [data-sentence]').first().getByRole('button').first().focus();
    await analyze.click();
    await expect.poll(() => ai.prompts.sentence.length).toBeGreaterThan(1);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Compléter le passage', exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/practice\/unit-reading-cloze$/);
  });
}

test('missing, deleted and mismatched passage routes never fall back to material or the last reader', async ({
  page,
}) => {
  await prepare(page);
  for (const path of ['petit-prince/missing', 'cafe-parisien/unit-reading-cloze']) {
    await page.goto(`/#/passage/${path}`);
    await expect(page.getByText('This passage is no longer available.', { exact: false })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(0);
  }
  await page.evaluate(async () => {
    const { deleteUnit }: Exercises = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await deleteUnit('unit-reading-cloze');
  });
  await page.goto('/#/passage/petit-prince/unit-reading-cloze');
  await expect(page.getByText('This passage is no longer available.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: /library/i })).toBeVisible();
});

test('passage pronunciation generation uses the passage and remains source-owned across Reader transitions', async ({
  page,
  ai,
}) => {
  await prepare(page);
  await page.getByRole('link', { name: 'Open in the reader' }).click();
  await page.locator('[data-pronunciation-toggle]').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(dialog).not.toContainText('Generating', { timeout: 30_000 });
  expect(ai.prompts.prosody).toHaveLength(2);
  expect(ai.prompts.prosody.join('\n')).toContain('Nous visitons le jardin.');
  expect(ai.prompts.prosody.join('\n')).toContain('Les oiseaux chantent dans les arbres.');
  expect(ai.prompts.prosody.join('\n')).not.toContain('Un jour, le Petit Prince');
  await page.keyboard.press('Escape');
  await page.locator('[data-pronunciation-toggle]').click();
  await expect(page.locator('[data-pronunciation-toggle]')).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => {
    location.hash = '#/read/petit-prince';
  });
  await expect(page.locator('[data-pronunciation-toggle]')).toHaveAttribute('aria-checked', 'false');
  await page.goBack();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.locator('[data-pronunciation-toggle]')).toHaveAttribute('aria-checked', 'true');
});
