/** Import leave decisions preserve real browser entries, including before deferred modules load. */
import { test, expect } from './fixtures';

test('dirty links, repeated Back cancellation, direct hash and Forward retain draft and real entries', async ({
  page,
  ai,
}) => {
  void ai;
  await page.goto('/#/read');
  await page.evaluate(async () => {
    const { navigate } = (await import(
      /* @vite-ignore */ '/src/hooks/useRoute.ts' as string
    )) as typeof import('../src/hooks/useRoute');
    navigate({ name: 'progress' });
    navigate({ name: 'import' });
  });
  await page.getByLabel('Text to send').fill('Texte non enregistré.');
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => history.back());
    await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(/#\/import$/);
    await expect(page.getByLabel('Text to send')).toHaveValue('Texte non enregistré.');
  }
  await page.evaluate(() => {
    location.hash = '#/settings/text-ai';
  });
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.evaluate(() => history.forward());
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings\/text-ai$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/import$/);
  await expect(page.getByLabel('Text to send')).toHaveValue('');
  await page.goBack();
  await expect(page).toHaveURL(/#\/progress$/);
});

test('existing reader id import stays a reader; reload only warns when dirty; deep-link history after reload', async ({
  page,
  ai,
}) => {
  void ai;
  await page.goto('/#/read');
  await page.evaluate(async () => {
    const { saveArticle } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    await saveArticle({
      id: 'import',
      title: 'Existing import id',
      content: 'Un vrai article.',
      level: 'A1',
      category: '',
      createdAt: '2026-01-01',
    });
  });
  await page.goto('/#/read/import');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Existing import id' })).toBeVisible();
  await page.goto('/#/import');
  await page.reload();
  await page.getByLabel('Text to send').fill('Mon texte.');
  const warning = page.waitForEvent('dialog');
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const dialog = await warning;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(page.getByLabel('Text to send')).toHaveValue('Mon texte.');
  await page.getByRole('link', { name: 'Text AI settings' }).click();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('link', { name: 'Text AI settings' }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings\/text-ai$/);
});

test('rapid repeated traversal remains at the indexed import entry after Keep', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/read');
  await page.evaluate(async () => {
    const { navigate } = (await import('/src/hooks/useRoute.ts' as string)) as typeof import('../src/hooks/useRoute');
    navigate({ name: 'progress' });
    navigate({ name: 'study', tab: 'words' });
    navigate({ name: 'import' });
  });
  await page.getByLabel('Text to send').fill('Texte à garder.');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      history.back();
      history.back();
    });
    await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(/#\/import$/);
    await expect(page.getByLabel('Text to send')).toHaveValue('Texte à garder.');
  }
  await page.evaluate(() => history.back());
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/words$/);
});

test('early bookkeeping without Navigation survives delayed module, native hashes, middle truncation and reload', async ({
  page,
  ai,
}) => {
  void ai;
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { value: undefined, configurable: true });
  });
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/main.tsx', async (route) => {
    await delayed;
    await route.continue();
  });
  await page.goto('/#/read', { waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.relireHistory);
  await page.evaluate(() => {
    location.hash = '#/progress';
  });
  await page.waitForTimeout(20);
  await page.evaluate(() => {
    location.hash = '#/import';
  });
  await page.waitForTimeout(20);
  release();
  await page.getByLabel('Text to send').fill('Early draft');
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => history.back());
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(/#\/import$/);
  }
  await page.evaluate(() => {
    location.hash = '#/settings/text-ai';
  });
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.evaluate(() => {
    location.hash = '#/study/words';
  });
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.evaluate(() => history.forward());
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/words$/);
  await page.reload();
  await page.goBack();
  await expect(page).toHaveURL(/#\/import$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/progress$/);
});
