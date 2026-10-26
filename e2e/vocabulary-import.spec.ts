/** Import dialog sizing: the dialog grows with its content; only the rejected list ever scrolls. */
import { expect, test } from './fixtures';

// `ai` onboards the app with a test key; nothing here calls the AI.
test('the Import dialog previews five rows in an open wrapper, without inner scroll windows', async ({ page, ai }) => {
  expect(ai.calls.tts).toBe(0);
  await page.goto('/#/words');
  await page.getByRole('button', { name: 'Import Anki notes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import Anki notes' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Notes file').setInputFiles({
    name: 'notes.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from(Array.from({ length: 7 }, (_, index) => `mot-${index}\tword-${index}`).join('\n')),
  });
  const preview = dialog.getByRole('region', { name: 'Preview: first five valid notes' });
  await expect(preview.locator('tbody tr')).toHaveCount(5);
  await expect(preview).not.toContainText('mot-5');
  const wrapper = preview.locator('div').first();
  await expect(wrapper).toHaveClass(/overflow-x-auto/);
  await expect(wrapper).not.toHaveClass(/h-40|overflow-auto/);
  const status = dialog.getByRole('status');
  await expect(status).toBeVisible();
  await expect(status).toHaveClass(/min-h-12/);
  await expect(status).not.toHaveClass(/h-32|h-40|overflow-auto/);
  // A text file never shows the package note-type picker; that row's own sizing is pinned in the unit test.
  await expect(dialog.locator('#import-notetype')).toHaveCount(0);
  await expect(dialog).not.toContainText('Package note type');
});
