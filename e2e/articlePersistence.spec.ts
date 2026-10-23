/** Article writes own one row; readiness and editor success follow durable storage. */
import { expect, test, layout, overflowing, settled } from './fixtures';

type Db = typeof import('../src/storage/db');

test('a stale tab saving one article preserves unrelated creation, edit and deletion', async ({ page, ai }) => {
  void ai;
  await page.goto('/');
  await expect(page.getByText('Le Petit Prince').first()).toBeVisible();
  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.getByText('Le Petit Prince').first()).toBeVisible();
  const changed = await other.evaluate(async () => {
    const { db, deleteArticleData }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const rows = await d.getAll('articles');
    const [edited, deleted] = rows.filter((a) => a.id !== 'petit-prince');
    const created = { ...edited, id: 'new-material', title: 'New material' };
    await d.put('articles', created);
    await d.put('articles', { ...edited, content: 'Texte modifié ailleurs.' });
    await deleteArticleData(deleted.id);
    return { edited: edited.id, deleted: deleted.id };
  });
  await page
    .getByRole('row')
    .filter({ hasText: 'Le Petit Prince' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await page.getByRole('dialog').getByLabel('Title').fill('My unrelated edit');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Flush the old implementation's debounced snapshot too, so this checks the completed write.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect
    .poll(() =>
      page.evaluate(async ({ edited, deleted }) => {
        const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
        const d = await db();
        return {
          created: !!(await d.get('articles', 'new-material')),
          edited: (await d.get('articles', edited))?.content,
          deleted: !!(await d.get('articles', deleted)),
        };
      }, changed),
    )
    .toEqual({ created: true, edited: 'Texte modifié ailleurs.', deleted: false });
  await page.reload();
  await expect(page.getByText('New material', { exact: true })).toBeVisible();
  await other.close();
});

for (const suffix of ['', ' @phone']) {
  test(`an editor write failure retains every draft field and permits one durable retry${suffix}`, async ({
    page,
    ai,
  }) => {
    void ai;
    await page.goto('/');
    await page.getByRole('button', { name: 'Add article', exact: true }).first().click();
    await page.getByRole('button', { name: 'Write or paste an article' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title', { exact: true }).fill('Brouillon conservé');
    await dialog.locator('select').selectOption('A2');
    await dialog.getByLabel('Category', { exact: true }).fill('Culture');
    await dialog.getByLabel('Source', { exact: true }).fill('Mon journal');
    await dialog.getByRole('textbox').last().fill('Un texte à conserver après une erreur.');
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
          return (await db()).count('articles');
        }),
      )
      .toBe(3);
    await page.evaluate(() => {
      // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original store as this.
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'articles') {
          IDBObjectStore.prototype.put = put;
          throw new DOMException('Article write refused', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    });
    await settled(page);
    await dialog.getByRole('button', { name: 'Add to library', exact: true }).scrollIntoViewIfNeeded();
    const before = await layout(page, '[role="dialog"]');
    await dialog.getByRole('button', { name: 'Add to library', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('Article write refused');
    await expect(page).not.toHaveURL(/#\/read\/custom-/);
    await expect(page.getByRole('main').getByText('Brouillon conservé', { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Brouillon conservé');
    await expect(dialog.locator('select')).toHaveValue('A2');
    await expect(dialog.getByLabel('Category', { exact: true })).toHaveValue('Culture');
    await expect(dialog.getByLabel('Source', { exact: true })).toHaveValue('Mon journal');
    await expect(dialog.getByRole('textbox').last()).toHaveValue('Un texte à conserver après une erreur.');
    expect(await layout(page, '[role="dialog"]')).toEqual(before);
    expect(await overflowing(dialog)).toEqual([]);
    // Keep an earlier article transaction open while retrying, to observe the pending editor.
    await page.evaluate(async () => {
      const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      const tx = (await db()).transaction('articles', 'readwrite');
      const hold = () => {
        const request = tx.store.get('petit-prince');
        void request.then(() => {
          if (!sessionStorage.getItem('releaseArticleWrite')) hold();
        });
      };
      hold();
    });
    await dialog.getByRole('button', { name: 'Add to library', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Add to library', exact: true })).toBeDisabled();
    await expect(page).not.toHaveURL(/#\/read\/custom-/);
    await expect(dialog.getByLabel('Title', { exact: true })).toBeDisabled();
    await expect(dialog.locator('select')).toBeDisabled();
    await expect(dialog.getByRole('textbox').last()).toBeDisabled();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Close', exact: true }).dispatchEvent('click');
    await expect(dialog).toBeVisible();
    expect(await layout(page, '[role="dialog"]')).toEqual(before);
    await page.evaluate(() => sessionStorage.setItem('releaseArticleWrite', '1'));
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/#\/read\/custom-/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Brouillon conservé', exact: true })).toBeVisible();
    expect(
      await page.evaluate(async () => {
        const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
        return (await (await db()).getAll('articles')).filter((a) => a.title === 'Brouillon conservé').length;
      }),
    ).toBe(1);
  });
}

test('seed failure never publishes readiness; reload, empty library and sample restore respect started', async ({
  page,
  ai,
}) => {
  void ai;
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seedFailed')) return;
    // oxlint-disable-next-line typescript/unbound-method -- Reapplied with the original store as this.
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'articles') {
        sessionStorage.setItem('seedFailed', '1');
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Seed write refused', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Le Petit Prince')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Seed write refused');
  expect(
    await page.evaluate(async () => {
      const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      const d = await db();
      return { started: await d.get('meta', 'started'), articles: await d.count('articles') };
    }),
  ).toEqual({ started: undefined, articles: 0 });
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByText('Le Petit Prince').first()).toBeVisible();
  const count = await page.evaluate(async () => {
    const { db, deleteArticleData }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const ids = await d.getAllKeys('articles');
    for (const id of ids) await deleteArticleData(id);
    return ids.length;
  });
  expect(count).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByText('Le Petit Prince')).toHaveCount(0);
  // Another tab restored and edited this sample while this screen still sees an empty library.
  await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const { SAMPLE_ARTICLES } = await import(/* @vite-ignore */ '/src/data/sampleArticles.ts' as string);
    await (await db()).put('articles', { ...SAMPLE_ARTICLES[0], title: 'Sample edited elsewhere' });
  });
  await page.getByRole('button', { name: /Restore sample/ }).click();
  await expect(page.getByText('Sample edited elsewhere', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Sample edited elsewhere', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      return (await db()).count('articles');
    }),
  ).toBe(count);
});
