/** Dialogs and the Settings page start from the saved values; nothing typed and abandoned comes back. */
import { expect, test } from './fixtures';

// `ai` onboards the app with a test key; nothing here calls the AI.
test.beforeEach(async ({ page, ai }) => {
  await page.goto('/');
  expect(ai.calls.tts).toBe(0);
});

test('settings come back with the saved values; an unsaved edit is not kept', async ({ page }) => {
  const key = page.getByPlaceholder('Paste your key here').first();

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings\/text-ai$/);
  await expect(key).toHaveValue('TEST');
  await key.fill('unsaved draft');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  await page.getByRole('link', { name: 'Read', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(key).toHaveValue('TEST');
});

test('the article editor shows the article it was opened for', async ({ page }) => {
  const title = page.getByRole('dialog').getByLabel('Title');

  await page.getByRole('button', { name: 'Edit' }).first().click();
  const edited = await title.inputValue();
  expect(edited).not.toBe('');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Add article' }).first().click();
  await expect(title).toHaveValue('');
  await title.fill('Brouillon');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(title).toHaveValue(edited);
});
