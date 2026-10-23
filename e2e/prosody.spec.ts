/** Pronunciation markers: whole-article generation, word-level demotion, failure pause. */
import { expect, layout, openArticle, overflowing, prosodySentence, prosodyTokens, test } from './fixtures';
import type { Page } from '@playwright/test';

async function generate(page: Page) {
  await page.locator('[data-pronunciation-toggle]').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(dialog).not.toContainText('Generating', { timeout: 30_000 });
  return dialog;
}

test('function words alone are enough to turn markers on', async ({ page, ai }) => {
  await openArticle(page);
  const before = await layout(page, 'article');
  const dialog = await generate(page);
  await expect(dialog).not.toContainText('Generation paused');
  expect(ai.calls.prosody).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  const toggle = page.locator('[data-pronunciation-toggle]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  // les/des/est… from the built-in table carry silent spelling.
  await expect(page.locator('article [data-grapheme].text-ink-500').first()).toBeVisible();
  expect((await layout(page, 'article')).top).toBe(before.top);
});

test('a word the AI misspells is left unmarked instead of failing its sentence', async ({ page, ai }) => {
  ai.answer({
    prosody: (prompt: string) => {
      const tokens = prosodyTokens(prompt);
      return {
        words: tokens.map(({ ordinal, source }) => ({
          ordinal,
          source,
          status: 'resolved',
          syllables: [{ spelling: `zz${source}`, ipa: 'za' }],
          groupEnd: true,
        })),
        // Out of range for one-word sentences, and a consonant the left word lacks.
        connections: [{ left: 0, type: 'liaison', sound: 'z', spelling: 'q' }],
      };
    },
  });
  await openArticle(page);
  const dialog = await generate(page);
  await expect(dialog).not.toContainText('Generation paused');
  await page.keyboard.press('Escape');
  const toggle = page.locator('[data-pronunciation-toggle]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('a provider failure pauses generation with the real error', async ({ page, ai }) => {
  ai.fail(['prosody']);
  await openArticle(page);
  const dialog = await generate(page);
  await expect(dialog).toContainText('Generation paused');
  await expect(dialog.getByRole('button', { name: 'Retry' })).toBeEnabled();
  // No new sentence is sent after the first one fails.
  expect(new Set(ai.prompts.prosody.map(prosodySentence)).size).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-pronunciation-toggle]')).toHaveAttribute('aria-checked', 'false');
});

test('a sentence whose answer keeps failing validation is skipped, and the article reopens ready', async ({
  page,
  ai,
}) => {
  let broken = '';
  ai.answer({
    prosody: (prompt: string) => {
      const sentence = prosodySentence(prompt);
      broken ||= sentence;
      const words = prosodyTokens(prompt).map(({ ordinal, source }) => ({
        ordinal,
        source,
        status: 'unresolved',
        syllables: [],
        groupEnd: false,
      }));
      // A missing word is a sentence-level alignment error.
      return { words: sentence === broken ? words.slice(1) : words, connections: [] };
    },
  });
  await openArticle(page);
  const dialog = await generate(page);
  await expect(dialog).not.toContainText('Generation paused');
  await expect(dialog).toContainText('Skipped sentences: 1');
  // One automatic retry, then the queue moves on.
  expect(ai.prompts.prosody.filter((prompt) => prosodySentence(prompt) === broken)).toHaveLength(2);
  await expect(dialog.getByRole('button', { name: 'Retry skipped sentences' })).toBeEnabled();
  expect(await overflowing(dialog)).toEqual([]);
  await page.keyboard.press('Escape');
  const toggle = page.locator('[data-pronunciation-toggle]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  const sent = ai.calls.prosody;
  await openArticle(page);
  await expect(page.locator('[data-pronunciation-toggle]')).toHaveAttribute('aria-checked', 'true');
  expect(ai.calls.prosody).toBe(sent);
});
