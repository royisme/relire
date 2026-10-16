/** Dialogs start from the saved values every time they open; nothing typed and cancelled comes back. */
import { expect, test } from './fixtures';

// `ai` onboards the app with a test key; nothing here calls the AI.
test.beforeEach(async ({ page, ai }) => {
  await page.goto('/');
  expect(ai.calls.tts).toBe(0);
});

test('settings reopen with the saved values after Cancel', async ({ page }) => {
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const key = settings.getByPlaceholder('Paste your key here').first();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(key).toHaveValue('TEST');
  await key.fill('unsaved draft');
  await settings.getByRole('button', { name: 'Cancel' }).click();
  await expect(settings).toBeHidden();

  await page.getByRole('button', { name: 'Settings' }).click();
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
