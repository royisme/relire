/** Passage recording ownership, durable return links and backward-compatible optional backups. */
import { expect, test, overflowing } from './fixtures';
import {
  unitId,
  title,
  card,
  prepare,
  chooseSentence,
  plays,
  trackPlayback,
  type Db,
  type Exercises,
} from './passage.helpers';
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  },
});

test.beforeEach(async ({ page, ai }) => {
  ai.ttsDelayMs = 30;
  await trackPlayback(page);
});
for (const phone of [false, true]) {
  test(`passage recording saves durably, resets keep history and Recordings opens its source and sentence after reload ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    ai.ttsDelayMs = 20;
    await prepare(page);
    await page.getByRole('link', { name: 'Open in the reader' }).click();
    await chooseSentence(page);
    await page.getByRole('button', { name: 'Practise this sentence', exact: true }).click();
    await expect(card(page).getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.waitForTimeout(900);
    await card(page).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(card(page).getByText('Saved.', { exact: true })).toBeVisible();
    await card(page)
      .getByRole('button', { name: /Play your recording/ })
      .click();
    await expect.poll(() => plays(page)).toContain('take');
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { listShadowing } = await import(/* @vite-ignore */ '/src/storage/shadowing.ts' as string);
          return (await listShadowing()).map((r: { passage?: { unitId: string }; takes: unknown[] }) => [
            r.passage?.unitId,
            r.takes.length,
          ]);
        }),
      )
      .toEqual([[unitId, 1]]);
    await page.evaluate(async (id) => {
      const { resetUnit }: Exercises = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
      await resetUnit(id);
    }, unitId);
    await card(page).getByText('All recordings (1)').click();
    await expect(page).toHaveURL(/#\/speaking\/recordings$/);
    await page.reload();
    await expect(page).toHaveURL(/#\/speaking\/recordings$/);
    await expect(page.getByRole('heading', { name: `Compléter le passage — ${title}` })).toBeVisible();
    await page.getByRole('button', { name: 'Les oiseaux chantent dans les arbres.', exact: true }).click();
    await expect(page).toHaveURL(/#\/passage\/unit-reading-cloze\?sentence=/);
    await page.reload();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('article [data-sentence]').nth(1)).toHaveClass(/bg-accent-100|bg-accent-50/);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    const roundtrip = await page.evaluate(async () => {
      const shadowing: typeof import('../src/storage/shadowing') = await import(
        /* @vite-ignore */ '/src/storage/shadowing.ts' as string
      );
      const storage: Exercises = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
      const { db, exportData, importData }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      const [record] = await shadowing.listShadowing();
      const original = await storage.getUnit('unit-reading-cloze');
      await storage.saveUnits([{ ...original!, id: 'removed-passage', unitNumber: 99 }]);
      await shadowing.addTake({ kind: 'passage', unitId: 'removed-passage' }, record.text, record.takes[0]);
      await storage.deleteUnit('removed-passage');
      // Article-owned recordings keep their own backup shape; same sentence does not share the passage key.
      await shadowing.addTake('petit-prince', record.text, record.takes[0]);
      const app = await exportData();
      const backup = await shadowing.exportShadowing();
      await shadowing.clearShadowing();
      await importData({ ...app, shadowing: shadowing.parseShadowingBackup(backup) });
      const restored = await shadowing.exportShadowing();
      await importData({});
      const d = await db();
      return {
        identical: JSON.stringify(restored) === JSON.stringify(backup),
        count: (await shadowing.listShadowing()).length,
        articleOwned: backup.some((r) => !r.passage),
        removed: !(await storage.getUnit('removed-passage')),
        version: d.version,
      };
    });
    expect(roundtrip.identical).toBe(true);
    expect(roundtrip.count).toBe(3);
    expect(roundtrip.articleOwned).toBe(true);
    expect(roundtrip.removed).toBe(true);
    expect(roundtrip.version).toBe(1);
    await page.goto('/#/speaking/recordings');
    await expect(page.getByText('Source unavailable (1)', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Compléter le passage — ${title}` })).toBeVisible();
  });
}
for (const phone of [false, true]) {
  test(`passage save failure retains its take for retry; edits never reassign old text ${phone ? '@phone' : ''}`, async ({
    page,
  }) => {
    await prepare(page);
    await page.getByRole('link', { name: 'Open in the reader' }).click();
    await chooseSentence(page);
    await page.getByRole('button', { name: 'Practise this sentence', exact: true }).click();
    await expect(card(page).getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.evaluate(() => {
      // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original store below.
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'shadowing') {
          IDBObjectStore.prototype.put = put;
          throw new DOMException('Recording write refused', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    });
    await page.waitForTimeout(900);
    await card(page).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(card(page).getByRole('alert')).toContainText('Recording write refused');
    await card(page).getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(card(page).getByText('Saved.', { exact: true })).toBeVisible();
    await expect(card(page).getByText('All recordings (1)')).toBeVisible();
    await page.evaluate(async () => {
      const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      const d = await db();
      const unit = (await d.get('units', 'unit-reading-cloze'))!;
      await d.put('units', { ...unit, readingPassage: { title: 'Le texte modifié', content: 'Le jardin est fermé.' } });
    });
    await page.goto('/#/speaking/recordings');
    await page.reload();
    await expect(page.getByText('Original text changed (1)', { exact: true })).toBeVisible();
    await page.getByText('Original text changed (1)', { exact: true }).click();
    await expect(page.getByText('Les oiseaux chantent dans les arbres.', { exact: true })).toBeVisible();
    await expect(page.locator('button[title="Open in the reader"]')).toHaveCount(0);
  });
}

for (const deletion of ['unit', 'set'] as const) {
  test(`a stopped take finishing after ${deletion} deletion cannot create orphan passage recordings`, async ({
    page,
  }) => {
    await prepare(page);
    await page.getByRole('link', { name: 'Open in the reader' }).click();
    await page.evaluate(async () => {
      const { Take }: typeof import('../src/utils/speech/recorder') = await import(
        /* @vite-ignore */ '/src/utils/speech/recorder.ts' as string
      );
      // Delay only delivery of the real fake-microphone result, not the storage call or its guard.
      // oxlint-disable-next-line typescript/unbound-method -- Called with its original Take instance.
      const stop = Take.prototype.stop;
      Take.prototype.stop = function () {
        return stop.call(this).then(async (result) => {
          await new Promise<void>((resolve) => {
            (window as unknown as { releasePassageTake: () => void }).releasePassageTake = resolve;
          });
          return result;
        });
      };
    });
    await chooseSentence(page);
    await page.getByRole('button', { name: 'Practise this sentence', exact: true }).click();
    await expect(card(page).getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.waitForTimeout(900);
    await card(page).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => typeof (window as unknown as { releasePassageTake?: () => void }).releasePassageTake),
      )
      .toBe('function');
    await page.evaluate(async (mode) => {
      const { deleteUnit }: Exercises = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
      const { deleteSetData }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      if (mode === 'unit') await deleteUnit('unit-reading-cloze');
      else await deleteSetData('set-1');
    }, deletion);
    // The delayed take's save opens its own shadowing write; that transaction ending is the signal that the
    // attempt is over, so the assertion below needs no arbitrary delay.
    await page.evaluate(() => {
      let finished: () => void = () => undefined;
      (window as unknown as { takeSaveFinished: Promise<void> }).takeSaveFinished = new Promise<void>((resolve) => {
        finished = () => resolve();
      });
      // oxlint-disable-next-line typescript/unbound-method -- Called with the original database below.
      const open = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args: Parameters<typeof open>) {
        const tx = open.apply(this, args);
        const scope = typeof args[0] === 'string' ? [args[0]] : [...args[0]];
        if (scope.includes('shadowing') && args[1] === 'readwrite') {
          tx.addEventListener('complete', () => finished());
          tx.addEventListener('abort', () => finished());
        }
        return tx;
      };
    });
    await page.evaluate(() => (window as unknown as { releasePassageTake: () => void }).releasePassageTake());
    await expect(page.getByText('This passage is no longer available.', { exact: false })).toBeVisible();
    await page.evaluate(() => (window as unknown as { takeSaveFinished: Promise<void> }).takeSaveFinished);
    const recordings = await page.evaluate(async () => {
      const { listShadowing }: typeof import('../src/storage/shadowing') = await import(
        /* @vite-ignore */ '/src/storage/shadowing.ts' as string
      );
      return (await listShadowing()).length;
    });
    expect(recordings).toBe(0);
    await page.reload();
    await expect(page.getByText('This passage is no longer available.', { exact: false })).toBeVisible();
  });
}

test('the log reaches unavailable history from the practice card and follows the source that still has rows', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('link', { name: 'Open in the reader' }).click();
  await chooseSentence(page);
  await page.getByRole('button', { name: 'Practise this sentence', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await card(page).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(card(page).getByText('Saved.', { exact: true })).toBeVisible();
  const passageSource = await page.evaluate(async () => {
    const { readerIdentity }: typeof import('../src/types/readerSource') = await import(
      /* @vite-ignore */ '/src/types/readerSource.ts' as string
    );
    return readerIdentity({ kind: 'passage', unitId: 'unit-reading-cloze' });
  });
  // One live source plus a recording whose passage no longer exists.
  await page.evaluate(async () => {
    const shadowing: typeof import('../src/storage/shadowing') = await import(
      /* @vite-ignore */ '/src/storage/shadowing.ts' as string
    );
    const storage: Exercises = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    const [record] = await shadowing.listShadowing();
    const unit = await storage.getUnit('unit-reading-cloze');
    await storage.saveUnits([{ ...unit!, id: 'removed-passage', unitNumber: 99 }]);
    await shadowing.addTake(
      { kind: 'passage', unitId: 'removed-passage' },
      'Nous visitons le jardin.',
      record.takes[0],
    );
    await storage.deleteUnit('removed-passage');
  });
  await card(page).getByText('All recordings (1)').click();
  const source = page.getByLabel('Source');
  await expect(source).toHaveValue(passageSource);
  await expect(page.locator('button[title="Open in the reader"]')).toHaveCount(1);
  await expect(page.getByText('Source unavailable (1)', { exact: true })).toHaveCount(0);
  // The selector is the only way to the unavailable history from here.
  await source.selectOption({ label: 'All sources' });
  await expect(page.getByText('Source unavailable (1)', { exact: true })).toBeVisible();
  await page.getByText('Source unavailable (1)', { exact: true }).click();
  await expect(page.getByText('Nous visitons le jardin.', { exact: true })).toBeVisible();

  // A second source with recordings: an article's own prose, read in the article reader.
  await page.goto('/#/read/petit-prince');
  const materialSentence = page.locator('article [data-sentence]').first();
  await materialSentence.getByRole('button').first().focus();
  await page.getByRole('button', { name: 'Practise this sentence', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await card(page).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(card(page).getByText('Saved.', { exact: true })).toBeVisible();
  const materialText = (await materialSentence.textContent())?.trim();
  // Enter the log again on the passage, then take it away under the open log.
  await page.goto('/#/passage/unit-reading-cloze');
  await chooseSentence(page);
  await page.getByRole('button', { name: 'Practise this sentence', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await card(page).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(card(page).getByText('Saved.', { exact: true })).toBeVisible();
  await card(page).getByText('All recordings (2)').click();
  await expect(page.getByLabel('Source')).toHaveValue(passageSource);
  await page.evaluate(async () => {
    const { deleteUnit }: Exercises = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await deleteUnit('unit-reading-cloze');
  });
  await expect(page.getByLabel('Source')).toHaveValue('all');
  await expect(page.getByText('Source unavailable (2)', { exact: true })).toBeVisible();
  const rows = page.locator('button[title="Open in the reader"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveText(materialText!);
});
