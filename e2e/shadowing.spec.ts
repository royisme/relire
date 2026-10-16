/**
 * Shadowing: the practice card records a sentence with Chromium's fake microphone,
 * keeps three takes per sentence, and the My study → Shadowing log replays them.
 * Every audio element that plays is logged with its blob type: TTS clips are
 * WAV, recordings are the recorder's own type (webm or ogg).
 */
import { expect, layout, openArticle, overflowing, test } from './fixtures';
import type { Page } from '@playwright/test';

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  },
});

// `ai` onboards the app and answers every AI request (speech included).
test.beforeEach(async ({ page, ai }) => {
  ai.ttsDelayMs = 50;
  await page.addInitScript(() => {
    const types = new Map<string, string>();
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = create(obj);
      if (obj instanceof Blob) types.set(url, obj.type);
      return url;
    };
    const log: string[] = [];
    (window as unknown as { __plays: string[] }).__plays = log;
    // Wrapped, then called with the element as `this`.
    // oxlint-disable-next-line typescript/unbound-method
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const type = types.get(this.src) ?? '';
      log.push(type.includes('wav') ? 'reference' : type ? 'take' : 'other');
      return play.call(this);
    };
  });
});

const plays = (page: Page) => page.evaluate(() => (window as unknown as { __plays: string[] }).__plays.slice());
const card = (page: Page) => page.locator('[data-practice-card]');

async function openCard(page: Page, index = 1) {
  const sentence = page.locator('article [data-sentence]').nth(index);
  await sentence.hover();
  await page.locator('[data-practice-entry]').click();
  await expect(card(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  return (await sentence.textContent())?.trim() ?? '';
}

async function recordFor(page: Page, ms = 900) {
  await expect(card(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(ms);
  await card(page).getByRole('button', { name: 'Stop' }).click();
  await expect(card(page).getByText('Saved.')).toBeVisible();
}

test('records a sentence, plays it back and compares, without moving the article', async ({ page }) => {
  await openArticle(page);
  const before = await layout(page, 'article');
  await openCard(page);
  await recordFor(page);
  await expect(card(page).getByText('All recordings (1)')).toBeVisible();

  await card(page)
    .getByRole('button', { name: /Play your recording/ })
    .click();
  await expect.poll(() => plays(page)).toEqual(['take']);

  await card(page).getByRole('button', { name: 'Compare' }).click();
  await expect.poll(() => plays(page), { timeout: 10_000 }).toEqual(['take', 'reference', 'take']);
  // The reader's bottom padding grows with the dock (so the last sentence can clear it); nothing above moves.
  const after = await layout(page, 'article');
  expect({ top: after.top, width: after.width }).toEqual({ top: before.top, width: before.width });
});

test('keeps the last three takes of a sentence', async ({ page }) => {
  await openArticle(page);
  await openCard(page);
  await recordFor(page);
  for (const count of [2, 3, 3]) {
    await card(page).getByRole('button', { name: 'Record again' }).click();
    await recordFor(page);
    await expect(card(page).getByText(`All recordings (${count})`)).toBeVisible();
  }
});

test('redo discards the running take; a too-short take is not saved', async ({ page }) => {
  await openArticle(page);
  await openCard(page);
  await page.waitForTimeout(700);
  await card(page).getByRole('button', { name: 'Redo' }).click();
  await recordFor(page);
  await expect(card(page).getByText('All recordings (1)')).toBeVisible();

  await card(page).getByRole('button', { name: 'Record again' }).click();
  await card(page).getByRole('button', { name: 'Stop' }).click();
  await expect(card(page).getByText(/Too short/)).toBeVisible();
  await expect(card(page).getByText('All recordings (1)')).toBeVisible();
});

test('closing the card while recording saves nothing; other sentences wait for the take', async ({ page }) => {
  await openArticle(page);
  await openCard(page, 1);
  const other = page.locator('article [data-sentence]').nth(3);
  await other.hover();
  await expect(page.locator('[data-practice-entry]')).toBeDisabled();

  await card(page).getByRole('button', { name: 'Close' }).click();
  await expect(card(page)).toHaveCount(0);
  await openCard(page, 1);
  await expect(card(page).getByText('No recordings of this sentence yet.')).toBeVisible();
});

test('Escape closes the card', async ({ page }) => {
  await openArticle(page);
  await openCard(page);
  await recordFor(page);
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
});

test('a denied microphone shows the browser error', async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await openArticle(page);
  await page.locator('article [data-sentence]').nth(1).hover();
  await page.locator('[data-practice-entry]').click();
  await expect(card(page).getByRole('alert')).toContainText('Permission denied');
});

test('the log lists recordings in article order, opens the reader and deletes takes', async ({ page }) => {
  await openArticle(page);
  const second = await openCard(page, 2);
  await recordFor(page);
  await card(page).getByRole('button', { name: 'Close' }).click();
  const first = await openCard(page, 0);
  await recordFor(page);

  await card(page).getByText('All recordings (1)').click();
  await expect(page.getByRole('heading', { name: 'Shadowing' })).toBeVisible();
  const rows = page.locator('button[title="Open in the reader"]');
  await expect(rows).toHaveText([first, second]);

  await page
    .getByRole('button', { name: /All recordings \(1\)/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Delete your recording/ }).click();
  await expect(rows).toHaveText([second]);

  await rows.first().click();
  await expect(page.locator('article [data-sentence]', { hasText: second }).first()).toBeInViewport();
});

test('deleting an article names its recordings, and only its own', async ({ page }) => {
  await openArticle(page);
  await openCard(page);
  await recordFor(page);
  await card(page).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();

  const row = (title: string) => page.getByRole('row').filter({ hasText: title });
  const confirm = page.getByRole('dialog');
  await row('Le Petit Prince').getByRole('button', { name: 'Delete' }).click();
  await expect(confirm.getByText('Your recordings of 1 sentences in it are deleted too.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();

  const other = page.getByRole('row').filter({ hasNotText: 'Le Petit Prince' }).nth(1);
  await other.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm.getByRole('button', { name: 'Delete' })).toBeVisible();
  await expect(confirm.getByText(/Your recordings of/)).toHaveCount(0);
});

test('opening a sentence from the log scrolls to it once', async ({ page }) => {
  await openArticle(page);
  const far = page.locator('article [data-sentence]').last();
  await far.scrollIntoViewIfNeeded();
  await far.hover();
  await page.locator('[data-practice-entry]').click();
  await recordFor(page);
  await card(page).getByText('All recordings (1)').click();

  await page.locator('button[title="Open in the reader"]').click();
  await expect(far).toBeInViewport();

  await page.getByRole('link', { name: 'Progress' }).click();
  await page.getByRole('link', { name: 'Read', exact: true }).click();
  await page.getByText('Le Petit Prince').first().click();
  await expect(page.locator('article [data-sentence]').first()).toBeVisible();
  // The pointer is still where the library row was; hovering a sentence would show its actions.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBeLessThan(200);
  await expect(page.locator('[data-sentence-actions]')).toBeHidden();
});

test('backup round-trips recordings; a backup without them keeps them', async ({ page }) => {
  await openArticle(page);
  await openCard(page);
  await recordFor(page);

  const backup = await page.evaluate(async () => {
    const shadowing: typeof import('../src/storage/shadowing') = await import(
      /* @vite-ignore */ '/src/storage/shadowing.ts' as string
    );
    return shadowing.exportShadowing();
  });
  expect(backup).toHaveLength(1);
  expect(backup[0].takes[0].mimeType).toMatch(/^audio\//);

  const restored = await page.evaluate(async (records) => {
    const shadowing: typeof import('../src/storage/shadowing') = await import(
      /* @vite-ignore */ '/src/storage/shadowing.ts' as string
    );
    const { importData }: typeof import('../src/storage/db') = await import(
      /* @vite-ignore */ '/src/storage/db.ts' as string
    );
    await shadowing.clearShadowing();
    await importData({ shadowing: shadowing.parseShadowingBackup(records) });
    const afterRestore = await shadowing.listShadowing();
    await importData({}); // no `shadowing` key
    const afterPlain = await shadowing.listShadowing();
    let rejected = '';
    try {
      shadowing.parseShadowingBackup([{ ...records[0], takes: [{ ...records[0].takes[0], data: '' }] }]);
    } catch (err) {
      rejected = (err as Error).name;
    }
    return {
      afterRestore: afterRestore.map((r) => [r.text, r.takes[0].mimeType, r.takes[0].bytes > 0]),
      plain: afterPlain.length,
      rejected,
    };
  }, backup);
  expect(restored.afterRestore).toEqual([[backup[0].text, backup[0].takes[0].mimeType, true]]);
  expect(restored.plain).toBe(1);
  expect(restored.rejected).toBe('ShadowingBackupError');
});

test('recording pauses listening to the article; it resumes afterwards', async ({ page, ai }) => {
  await openArticle(page);
  await page.getByRole('button', { name: 'Listen' }).click();
  const player = page.getByRole('region', { name: 'Article player' });
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => plays(page)).toContain('reference');

  await openCard(page, 3);
  await expect(player.getByRole('button', { name: 'Play' })).toBeVisible();
  await recordFor(page);
  await expect(player).toBeVisible();

  const before = ai.calls.tts;
  await player.getByRole('button', { name: 'Play' }).click();
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => ai.calls.tts).toBeGreaterThanOrEqual(before);
  await expect.poll(async () => (await plays(page)).filter((p) => p === 'reference').length).toBeGreaterThan(1);
});

test('upgrading a version 3 database keeps its data', async ({ page }) => {
  // Build the version 3 schema with one article and one word before the app opens it.
  await page.goto('/robots.txt'); // same origin, without the app opening the database first
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('relire', 3);
        open.onupgradeneeded = () => {
          const d = open.result;
          d.createObjectStore('articles', { keyPath: 'id' });
          d.createObjectStore('vocab', { keyPath: 'id' });
          d.createObjectStore('meta');
          d.createObjectStore('cache', { keyPath: 'key' }).createIndex('kind', 'kind');
          const audio = d.createObjectStore('audio', { keyPath: 'key' });
          audio.createIndex('text', 'text');
          audio.createIndex('lastUsed', 'lastUsed');
        };
        open.onsuccess = () => {
          const tx = open.result.transaction(['articles', 'vocab', 'meta'], 'readwrite');
          tx.objectStore('articles').put({
            id: 'old',
            title: 'Ancien article',
            content: 'Une phrase ancienne.',
            level: 'A2',
            category: 'test',
            createdAt: '2026-01-01T00:00:00.000Z',
          });
          tx.objectStore('vocab').put({
            id: 'w1',
            word: 'ancien',
            lemma: 'ancien',
            ipa: '',
            translation: 'old',
            partOfSpeech: 'adj',
            contextSentence: 'Une phrase ancienne.',
            addedAt: '2026-01-01T00:00:00.000Z',
            repetitions: 0,
            intervalDays: 0,
            easeFactor: 2.5,
            nextReviewDate: '2026-01-01',
            reviewHistory: [],
          });
          tx.objectStore('meta').put(true, 'started');
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.goto('/');
  await expect(page.getByText('Ancien article')).toBeVisible();
  const stores = await page.evaluate(
    () =>
      new Promise<{ version: number; stores: string[] }>((resolve) => {
        const open = indexedDB.open('relire');
        open.onsuccess = () => {
          resolve({ version: open.result.version, stores: [...open.result.objectStoreNames] });
          open.result.close();
        };
      }),
  );
  expect(stores.version).toBe(5);
  expect(stores.stores).toContain('shadowing');
  await page.getByRole('link', { name: 'My study' }).click();
  await expect(page.getByText('ancien').first()).toBeVisible();
});

test('the practice card fits a phone @phone', async ({ page }) => {
  await openArticle(page);
  await page.locator('article [data-sentence]').nth(1).tap();
  await page.locator('[data-practice-entry]').tap();
  await expect(card(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  expect(await overflowing(page.locator('body'))).toEqual([]);
  const box = await card(page).boundingBox();
  expect(box!.width).toBeLessThanOrEqual(360);
});

test('minimising the card keeps recording to one row', async ({ page }) => {
  await openArticle(page);
  await openCard(page);
  const full = (await card(page).boundingBox())!.height;
  await card(page).getByRole('button', { name: 'Minimise' }).click();
  expect((await card(page).boundingBox())!.height).toBeLessThan(full / 2);
  await expect(card(page).getByRole('button', { name: 'Redo' })).toHaveCount(0);

  await page.waitForTimeout(800);
  await card(page).getByRole('button', { name: 'Stop' }).click();
  await expect(card(page).getByRole('button', { name: 'Record again' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Show the practice card' }).click();
  await expect(card(page).getByText('All recordings (1)')).toBeVisible();
});

test('on touch, sentence actions sit in the bottom bar, clear of the text @phone', async ({ page }) => {
  await openArticle(page);
  const sentence = page.locator('article [data-sentence]').nth(1);
  await sentence.tap();
  const bar = page.locator('[data-sentence-actions]');
  await expect(bar).toBeVisible();
  await expect(page.locator('article [data-sentence-actions]')).toHaveCount(0);
  const [s, b] = [(await sentence.boundingBox())!, (await bar.boundingBox())!];
  expect(s.y + s.height).toBeLessThanOrEqual(b.y);

  // A sentence low on the screen is scrolled up so the bar does not cover it.
  const low = page.locator('article [data-sentence]').nth(6);
  await low.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -(innerHeight - 160)));
  await low.tap();
  await expect
    .poll(async () => {
      const [l, bb] = [(await low.boundingBox())!, (await bar.boundingBox())!];
      return l.y + l.height <= bb.y;
    })
    .toBe(true);

  await bar.getByRole('button', { name: 'Close' }).click();
  await expect(bar).toHaveCount(0);
  await low.tap();
  await bar.locator('[data-practice-entry]').tap();
  await expect(card(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(bar).toHaveCount(0);
});

test('the card can be dragged on desktop, keeps its place, and docks on double-click', async ({ page }) => {
  await openArticle(page);
  await openCard(page);
  await recordFor(page);
  const handle = card(page).getByRole('button', { name: 'Move the card' });
  const before = (await card(page).boundingBox())!;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 300, grip.y - 300, { steps: 8 });
  await page.mouse.up();
  const moved = (await card(page).boundingBox())!;
  expect(moved.x).toBeGreaterThan(before.x + 200);
  expect(moved.y).toBeLessThan(before.y - 200);

  // Practising another sentence opens the card where it was left.
  await card(page).getByRole('button', { name: 'Close' }).click();
  await openCard(page, 3);
  const reopened = (await card(page).boundingBox())!;
  expect(Math.abs(reopened.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(reopened.y - moved.y)).toBeLessThan(2);

  await card(page).getByRole('button', { name: 'Move the card' }).dblclick();
  await expect.poll(async () => (await card(page).boundingBox())!.y).toBeGreaterThan(moved.y + 200);
});
