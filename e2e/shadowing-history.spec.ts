/** Sentence-first history geometry and per-take actions; playback is mocked, never sent to real audio. */
import type { Page } from '@playwright/test';
import { expect, overflowing, settled, test } from './fixtures';

type HistoryPlayback = {
  historyPlays: string[];
  historyAudio: HTMLMediaElement[];
};
const longSentence =
  'Lorsque Manon revient de la bibliothèque après une longue journée de travail, elle prend le temps de relire attentivement chaque phrase de son livre préféré pour mieux comprendre les expressions nouvelles.';
const soleSentence = "Bonjour, je m'appelle Manon.";
const rowFor = (page: Page, text: string) => page.getByRole('button', { name: text, exact: true }).locator('..');
const plays = (page: Page) => page.evaluate(() => (window as unknown as HistoryPlayback).historyPlays.slice());

async function finishAudio(page: Page) {
  await page.evaluate(() =>
    (window as unknown as HistoryPlayback).historyAudio.at(-1)!.dispatchEvent(new Event('ended')),
  );
}

async function prepareHistory(page: Page) {
  await page.goto('/#/read');
  await expect(page.getByText('Le Petit Prince').first()).toBeVisible();
  await page.evaluate(
    async ({ longSentence, soleSentence }) => {
      const { saveArticle }: typeof import('../src/storage/db') = await import(
        /* @vite-ignore */ '/src/storage/db.ts' as string
      );
      const { addTake }: typeof import('../src/storage/shadowing') = await import(
        /* @vite-ignore */ '/src/storage/shadowing.ts' as string
      );
      await saveArticle({
        id: 'history-manon',
        title: 'Manon',
        content: `${soleSentence} ${longSentence}`,
        level: 'B1',
        category: 'test',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      for (const [text, count] of [
        [soleSentence, 1],
        [longSentence, 3],
      ] as const) {
        for (let i = 0; i < count; i++) {
          await addTake('history-manon', text, {
            blob: new Blob(['mock recording'], { type: 'audio/webm' }),
            mimeType: 'audio/webm',
            durationMs: 11000 + i * 1000,
            recordedAt: Date.parse('2026-10-17T21:31:00.000Z') + i * 60000,
          });
        }
      }
    },
    { longSentence, soleSentence },
  );
  await page.goto('/#/speaking/recordings');
  await page.reload(); // App reads the saved article on startup, just like returning to existing history.
  await expect(page.getByRole('heading', { name: /Manon/ })).toBeVisible();
  await settled(page);
}

test.beforeEach(async ({ page, ai }) => {
  ai.ttsDelayMs = 30;
  await page.addInitScript(() => {
    const types = new Map<string, string>();
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value: Blob | MediaSource) => {
      const url = create(value);
      if (value instanceof Blob) types.set(url, value.type);
      return url;
    };
    // Keep fixture blobs out of the native decoder; playback events are driven by this spec.
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super();
        Object.defineProperty(this, 'src', { value: src ?? '' });
      }
    };
    const state = window as unknown as HistoryPlayback;
    state.historyPlays = [];
    state.historyAudio = [];
    HTMLMediaElement.prototype.play = function () {
      state.historyPlays.push(types.get(this.src)?.includes('wav') ? 'reference' : 'take');
      state.historyAudio.push(this);
      return Promise.resolve();
    };
  });
});

for (const phone of [false, true]) {
  test(`history gives sentences and related actions the full width, with all takes accessible ${phone ? '@phone' : ''}`, async ({
    page,
  }) => {
    await prepareHistory(page);
    for (const theme of ['light', 'sepia', 'dark']) {
      await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
      for (const text of [soleSentence, longSentence]) {
        const row = rowFor(page, text);
        const sentence = row.getByRole('button', { name: text, exact: true });
        const reference = row.getByRole('button', { name: 'Reference', exact: true });
        const play = row.getByRole('button', { name: 'Play my recording', exact: true });
        await expect(row.getByText(/^Last recorded:/)).toContainText(text === soleSentence ? '0:11' : '0:13');
        const sentenceBox = (await sentence.boundingBox())!;
        const rowBox = (await row.boundingBox())!;
        // The actions row itself, not the speak control's positioning wrapper.
        const actionsBox = (await row.locator('[data-shadowing-actions]').boundingBox())!;
        expect(Math.abs(sentenceBox.width - rowBox.width)).toBeLessThan(2);
        expect(Math.abs(actionsBox.width - rowBox.width)).toBeLessThan(2);
        expect(actionsBox.y).toBeGreaterThanOrEqual(sentenceBox.y + sentenceBox.height);
        for (const control of [sentence, reference, play, row.getByRole('button', { name: 'Compare', exact: true })]) {
          const box = (await control.boundingBox())!;
          expect(box.height).toBeGreaterThanOrEqual(40);
          expect(box.width).toBeGreaterThanOrEqual(40);
        }
        const expand = row.getByRole('button', { name: /All recordings/ });
        await expect(expand).toHaveText(text === soleSentence ? 'All recordings (1)' : 'All recordings (3)');
        await expand.click();
        await expect(expand).toHaveAttribute('aria-expanded', 'true');
        const takes = row.getByRole('list');
        expect(Math.abs((await takes.boundingBox())!.width - rowBox.width)).toBeLessThan(2);
        await expect(takes.getByRole('button', { name: /Delete your recording/ })).toHaveCount(
          text === soleSentence ? 1 : 3,
        );
        await expect(takes.getByRole('button', { name: /Play your recording from/ })).toHaveCount(
          text === soleSentence ? 1 : 3,
        );
        for (const control of await takes.getByRole('button').all()) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(40);
        }
        expect(await overflowing(row)).toEqual([]);
        await expand.click();
      }
      expect(await overflowing(page.locator('body'))).toEqual([]);
    }
  });

  test(`history deletes exactly the chosen take, including the only take, and opens the sentence ${phone ? '@phone' : ''}`, async ({
    page,
  }) => {
    await prepareHistory(page);
    const sole = rowFor(page, soleSentence);
    await sole.getByRole('button', { name: 'All recordings (1)', exact: true }).click();
    await sole.getByRole('button', { name: /Delete your recording/ }).click();
    await expect(page.getByRole('button', { name: soleSentence, exact: true })).toHaveCount(0);
    const multi = rowFor(page, longSentence);
    await multi.getByRole('button', { name: 'All recordings (3)', exact: true }).click();
    await multi
      .getByRole('button', { name: /Delete your recording/ })
      .nth(1)
      .click();
    await expect(multi.getByRole('button', { name: 'All recordings (2)', exact: true })).toBeVisible();
    await expect(multi.getByRole('list').getByRole('button', { name: /Play your recording from/ })).toHaveCount(2);
    const retained = await page.evaluate(async () => {
      const { listShadowing }: typeof import('../src/storage/shadowing') = await import(
        /* @vite-ignore */ '/src/storage/shadowing.ts' as string
      );
      return (await listShadowing()).map((record) => ({
        text: record.text,
        durations: record.takes.map((take) => take.durationMs),
      }));
    });
    expect(retained).toEqual([{ text: longSentence, durations: [11000, 13000] }]);
    await multi.getByRole('button', { name: longSentence, exact: true }).click();
    await expect(page).toHaveURL(/#\/read\/history-manon\?sentence=/);
    await expect(page.locator('article [data-sentence]', { hasText: longSentence })).toBeInViewport();
  });
}

test('history playback shares take state and Compare chains only after the reference ends', async ({ page }) => {
  await prepareHistory(page);
  const row = rowFor(page, longSentence);
  await row.getByRole('button', { name: 'Play my recording', exact: true }).click();
  await expect.poll(() => plays(page)).toEqual(['take']);
  await row.getByRole('button', { name: 'All recordings (3)', exact: true }).click();
  const latest = row
    .getByRole('list')
    .getByRole('button', { name: /Play your recording from/ })
    .first();
  await expect(latest.locator('svg')).toHaveClass(/fill-current/);
  await latest.click(); // Expanded and collapsed controls stop the same global take.
  await expect(latest.locator('svg')).not.toHaveClass(/fill-current/);
  await row.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect.poll(() => plays(page)).toEqual(['take', 'reference']);
  await row.getByRole('button', { name: 'Stop', exact: true }).click();
  await finishAudio(page); // A late ended event after interruption must not chain a take.
  expect(await plays(page)).toEqual(['take', 'reference']);
  await row.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect.poll(() => plays(page)).toEqual(['take', 'reference', 'reference']);
  await finishAudio(page);
  await expect.poll(() => plays(page)).toEqual(['take', 'reference', 'reference', 'take']);
  await finishAudio(page);
  await row
    .getByRole('list')
    .getByRole('button', { name: /Play your recording from/ })
    .last()
    .click();
  await expect.poll(() => plays(page)).toEqual(['take', 'reference', 'reference', 'take', 'take']);
});

test('keyboard expansion keeps the sole take available after a failed delete', async ({ page }) => {
  await prepareHistory(page);
  const row = rowFor(page, soleSentence);
  const expand = row.getByRole('button', { name: 'All recordings (1)', exact: true });
  await expand.focus();
  await page.keyboard.press('Enter');
  await expect(expand).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Restored and called with the original store below.
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'shadowing') {
        IDBObjectStore.prototype.delete = remove;
        throw new DOMException('Recording delete refused', 'UnknownError');
      }
      return remove.call(this, key);
    };
  });
  await row.getByRole('button', { name: /Delete your recording/ }).click();
  await expect(page.getByRole('alert')).toContainText('Recording delete refused');
  await expect(row.getByRole('button', { name: /Play your recording from/ })).toBeVisible();
  await row.getByRole('button', { name: /Delete your recording/ }).click();
  await expect(page.getByRole('button', { name: soleSentence, exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
