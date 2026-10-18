/**
 * Settings → AI services: three purpose pages sharing one key and one save, with real model discovery.
 * Every provider request is mocked here or by fixtures.ts; no key in these tests is real.
 */
import type { Page } from '@playwright/test';
import { expect, overflowing, settled, test } from './fixtures';
import { materialPdf } from './materialPdf';

const listPath = '**/v1beta/models**';
const listBody = (names: { name: string; displayName?: string }[], nextPageToken?: string) =>
  JSON.stringify({ models: names, ...(nextPageToken ? { nextPageToken } : {}) });

/** Answers model-list requests from `answer`, in place of the fixtures' generateContent handler. */
async function mockModelList(page: Page, answer: (url: URL) => { status?: number; body: string }) {
  await page.route(listPath, async (route) => {
    const { status = 200, body } = answer(new URL(route.request().url()));
    try {
      await route.fulfill({ status, contentType: 'application/json', body });
    } catch {
      // The page cancelled the request (key or provider changed); nothing to answer.
    }
  });
}

const modelField = (page: Page) => page.getByLabel('Model', { exact: true });
const keyField = (page: Page) => page.getByPlaceholder('Paste your key here');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });

test('AI services is one Settings destination with three real purpose links', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/settings/ai/text');
  const sidebar = page.locator('[data-sidebar]');
  await expect(sidebar.locator('a[href^="#/settings/"]')).toHaveCount(4);
  await expect(sidebar.getByRole('link', { name: 'AI services' })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('link', { name: 'Text AI' })).toHaveCount(0);

  for (const [label, purpose] of [
    ['OCR', 'ocr'],
    ['Speech synthesis', 'speech'],
    ['Text AI', 'text'],
  ] as const) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/settings/ai/${purpose}$`));
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }

  // The old AI sections are gone, not aliased; a bare AI address opens the text purpose.
  await page.goto('/#/settings/ai');
  await expect(page).toHaveURL(/#\/settings\/ai\/text$/);
  await page.goto('/#/settings/text-ai');
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
});

test('one key draft and one save cover all three purposes; models stay independent', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/settings/ai/text');
  await expect(saveButton(page)).toBeDisabled();
  await keyField(page).fill('DRAFT-KEY');
  await modelField(page).fill('custom-text-1');

  await page.getByRole('link', { name: 'OCR', exact: true }).click();
  await expect(keyField(page)).toHaveValue('DRAFT-KEY');
  await page.getByLabel('Model', { exact: true }).fill('custom-ocr-2');
  await expect(page.getByText('This key is also used by Text AI, Speech synthesis.')).toBeVisible();

  await page.getByRole('link', { name: 'Speech synthesis', exact: true }).click();
  await expect(keyField(page)).toHaveValue('DRAFT-KEY');
  await modelField(page).fill('custom-speech-3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('relire_app_settings_v1')!));
  expect([stored.textModel, stored.ocrModel, stored.speechModel]).toEqual([
    'custom-text-1',
    'custom-ocr-2',
    'custom-speech-3',
  ]);
  expect(stored.apiKeys.gemini).toBe('DRAFT-KEY');

  await page.reload();
  await expect(modelField(page)).toHaveValue('custom-speech-3');
  await page.goto('/#/settings/ai/text');
  await expect(modelField(page)).toHaveValue('custom-text-1');
  await page.goto('/#/settings/ai/ocr');
  await expect(modelField(page)).toHaveValue('custom-ocr-2');
});

test('fetching models uses the unsaved key, follows pages and keeps a selected ID that is not listed', async ({
  page,
  ai,
}) => {
  const sentKeys: (string | undefined)[] = [];
  const tokens: (string | null)[] = [];
  await page.route(listPath, async (route) => {
    const url = new URL(route.request().url());
    sentKeys.push(route.request().headers()['x-goog-api-key']);
    tokens.push(url.searchParams.get('pageToken'));
    const body =
      url.searchParams.get('pageToken') === 'page-2'
        ? listBody([{ name: 'models/gemini-3-pro' }, { name: 'models/gemini-9-flash' }])
        : listBody([{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-9-flash' }], 'page-2');
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await page.goto('/#/settings/ai/text');
  // The stored key is TEST; clearing the draft disables discovery and says why.
  await keyField(page).fill('');
  await expect(page.getByRole('button', { name: 'Fetch models' })).toBeDisabled();
  await expect(page.getByText('Enter a key above to fetch the model list.')).toBeVisible();

  // A model typed by hand is kept when the fetched list does not contain it.
  await keyField(page).fill('UNSAVED-KEY');
  await modelField(page).fill('custom-kept-4');
  await page.getByRole('button', { name: 'Fetch models' }).click();
  await expect(page.getByText('3 models found. Fetching does not test them.')).toBeVisible();
  expect(tokens).toEqual([null, 'page-2']);
  expect(sentKeys).toEqual(['UNSAVED-KEY', 'UNSAVED-KEY']);
  await expect(modelField(page)).toHaveValue('custom-kept-4');
  await expect(page.getByText('The selected model is not in this list. It stays selected.')).toBeVisible();
  // Discovery is not a generation call.
  expect([ai.calls.word, ai.calls.sentence, ai.calls.tts]).toEqual([0, 0, 0]);

  // Refresh follows the pages again and keeps the selection.
  await page.getByRole('button', { name: 'Refresh models' }).click();
  await expect.poll(() => tokens.length).toBe(4);
  await expect(page.getByText('3 models found. Fetching does not test them.')).toBeVisible();
  await expect(modelField(page)).toHaveValue('custom-kept-4');
});

test('an empty or failed model list keeps the selection and shows the real reason', async ({ page, ai }) => {
  void ai;
  let mode: 'empty' | 'fail' = 'empty';
  await mockModelList(page, () =>
    mode === 'empty' ? { body: JSON.stringify({ models: [] }) } : { status: 500, body: '{"error":{"message":"nope"}}' },
  );
  await page.goto('/#/settings/ai/text');
  await modelField(page).fill('custom-kept-5');
  await page.getByRole('button', { name: 'Fetch models' }).click();
  await expect(page.getByText('The provider returned no models. Your selection is unchanged.')).toBeVisible();
  await expect(modelField(page)).toHaveValue('custom-kept-5');

  mode = 'fail';
  await page.getByRole('button', { name: 'Refresh models' }).click();
  await expect(page.getByText('nope', { exact: false })).toBeVisible();
  await expect(modelField(page)).toHaveValue('custom-kept-5');
});

test('a check uses the draft without saving, and a refused save is reported', async ({ page, ai }) => {
  await page.goto('/#/settings/ai/text');
  await expect(page.getByText('Saving keeps your choices; it does not test them.')).toBeVisible();
  await keyField(page).fill('CHECK-ONLY');
  await page.getByRole('button', { name: 'Check key' }).click();
  await expect(page.getByText('The key works.')).toBeVisible();
  expect(ai.calls.word).toBeGreaterThan(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('relire_app_settings_v1')!).apiKeys.gemini)).toBe(
    'TEST',
  );

  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  });
  await saveButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
  await expect(keyField(page)).toHaveValue('CHECK-ONLY');
});

test('the import link names the OCR purpose, shows its own model and keeps the draft unless discarded', async ({
  page,
  ai,
}) => {
  void ai;
  await page.goto('/#/read');
  await page.evaluate(async () => {
    const { saveAppSettings } = (await import(
      '/src/utils/appSettings.ts' as string
    )) as typeof import('../src/utils/appSettings');
    // A text model that cannot read images must not change what the import advertises.
    saveAppSettings({ textModel: 'gemini-3.8-flash', ocrModel: 'gemini-2.5-pro' });
  });
  await page.goto('/#/import');
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-pro')).toBeVisible();

  // A later settings change cannot redirect a request the learner already sees.
  await page.evaluate(async () => {
    const { saveAppSettings } = (await import(
      '/src/utils/appSettings.ts' as string
    )) as typeof import('../src/utils/appSettings');
    saveAppSettings({ ocrModel: 'gemini-2.5-flash' });
  });
  await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-pro')).toBeVisible();

  const link = page.getByRole('link', { name: 'OCR settings' });
  await link.click();
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/#\/import$/);
  await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-pro')).toBeVisible();

  await link.click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings\/ai\/ocr\?key=1&return=%23%2Fimport$/);
  await expect(keyField(page)).toBeFocused();
  await page.getByRole('button', { name: 'Go back to where you were' }).click();
  await expect(page).toHaveURL(/#\/import$/);
});

test('a purpose switch does not pull the focus back to the key', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/settings/ai/text?key=1&return=%23%2Fimport');
  await expect(keyField(page)).toBeFocused();
  await page.getByRole('link', { name: 'OCR', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings\/ai\/ocr$/);
  await expect(keyField(page)).not.toBeFocused();
  await page.getByRole('link', { name: 'Text AI', exact: true }).click();
  await expect(keyField(page)).not.toBeFocused();
});

test('the device engine needs no key, model or voice, and its preview speaks on the device itself', async ({
  page,
  ai,
}) => {
  void ai;
  // A stand-in platform voice: one French voice and a record of what was asked to be spoken.
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { spoken: string[] }).spoken = spoken;
    const voices = [{ lang: 'fr-FR', name: 'Test French voice', default: true }];
    const synthesis = {
      speaking: false,
      paused: false,
      getVoices: () => voices,
      addEventListener: () => {},
      removeEventListener: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      speak: (utterance: { text: string; onend: (() => void) | null }) => {
        spoken.push(utterance.text);
        setTimeout(() => utterance.onend?.(), 0);
      },
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };
  });
  await page.goto('/#/settings/ai/speech');
  await page.getByLabel('Provider').selectOption('device');
  // No key, model or voice for it, and a plain sentence about what it does and costs.
  await expect(keyField(page)).toHaveCount(0);
  await expect(modelField(page)).toHaveCount(0);
  await expect(page.getByLabel('Voice')).toHaveCount(0);
  await expect(page.getByText('Speaks with this device', { exact: false })).toBeVisible();
  await expect(page.getByText('No key needed')).toHaveCount(0);

  await page.getByRole('button', { name: 'Preview voice' }).click();
  await expect(page.getByText('Connection and voice work.')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken))
    .toEqual(['Bonjour ! Bienvenue sur Relire.']);
  // Previewing the device voice asks no provider for anything.
  expect(ai.calls.tts).toBe(0);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('relire_app_settings_v1')!));
  expect([stored.speechProvider, stored.speechModel, stored.speechVoice]).toEqual(['device', '', '']);
});

test('each speech engine keeps its own model and voice when you switch, even after a reload', async ({ page, ai }) => {
  void ai;
  const fishVoice = '0123456789abcdef0123456789abcdef';
  await page.goto('/#/settings/ai/speech');
  await modelField(page).fill('gemini-3.8-flash-tts');
  await page.getByLabel('Voice').selectOption('Zephyr');
  await saveButton(page).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // Fish Audio starts from its own defaults and keeps its own model and voice.
  await page.getByLabel('Provider').selectOption('fish-audio');
  await expect(modelField(page)).toHaveValue('fish-audio/s2.1-pro-free');
  await modelField(page).fill('fish-audio/s2.1-pro');
  await page.getByLabel('Voice ID').fill(fishVoice);
  await saveButton(page).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // Coming back to Gemini restores what it had, not the defaults.
  await page.getByLabel('Provider').selectOption('gemini');
  await expect(modelField(page)).toHaveValue('gemini-3.8-flash-tts');
  await expect(page.getByLabel('Voice')).toHaveValue('Zephyr');
  // Fish Audio kept its own in the same draft.
  await page.getByLabel('Provider').selectOption('fish-audio');
  await expect(modelField(page)).toHaveValue('fish-audio/s2.1-pro');
  await expect(page.getByLabel('Voice ID')).toHaveValue(fishVoice);

  await page.reload();
  await expect(modelField(page)).toHaveValue('fish-audio/s2.1-pro');
  await page.getByLabel('Provider').selectOption('gemini');
  await expect(modelField(page)).toHaveValue('gemini-3.8-flash-tts');
  await expect(page.getByLabel('Voice')).toHaveValue('Zephyr');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('relire_app_settings_v1')!));
  expect(stored.speechChoices).toEqual({
    gemini: { model: 'gemini-3.8-flash-tts', voice: 'Zephyr' },
    'fish-audio': { model: 'fish-audio/s2.1-pro', voice: fishVoice },
  });
});

test('an unconfirmed OCR model stays selectable with honest copy', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/settings/ai/ocr');
  await modelField(page).fill('custom-vision-xyz');
  await expect(page.getByText("This model's support for this task is unconfirmed.", { exact: false })).toBeVisible();
  await expect(page.getByText('Images and PDFs read this selection; pasted text uses Text AI.')).toBeVisible();
});

test('an unsaved AI draft survives purpose and section switches without a dialog', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/settings/ai/text');
  await keyField(page).fill('UNSAVED');
  await modelField(page).fill('custom-text-9');

  // Internal Settings navigation never asks, and never loses the draft.
  for (const purpose of ['OCR', 'Text AI'] as const) {
    await page.getByRole('link', { name: purpose, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(keyField(page)).toHaveValue('UNSAVED');
  await expect(modelField(page)).toHaveValue('custom-text-9');
  const sidebar = page.locator('[data-sidebar]');
  await sidebar.getByRole('link', { name: 'Prompts' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await sidebar.getByRole('link', { name: 'AI services' }).click();
  await expect(keyField(page)).toHaveValue('UNSAVED');
});

test('leaving with an unsaved AI draft asks first, by link, Back or reload', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/read');
  await page.goto('/#/settings/ai/text');
  await keyField(page).fill('UNSAVED');
  const leaving = page.getByRole('dialog', { name: 'Discard the unsaved AI settings?' });

  // A link out of Settings asks; keeping the draft stays on the page with the edits.
  await page.getByRole('link', { name: 'Read', exact: true }).click();
  await expect(leaving).toBeVisible();
  await leaving.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/#\/settings\/ai\/text$/);
  await expect(keyField(page)).toHaveValue('UNSAVED');

  // Back asks as well, and cancelling it restores the page as it was.
  await page.goBack();
  await expect(leaving).toBeVisible();
  await leaving.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/#\/settings\/ai\/text$/);
  await expect(keyField(page)).toHaveValue('UNSAVED');

  // A reload while dirty warns first.
  const warning = page.waitForEvent('dialog');
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const nativeDialog = await warning;
  expect(nativeDialog.type()).toBe('beforeunload');
  await nativeDialog.dismiss();
  await expect(keyField(page)).toHaveValue('UNSAVED');

  // Discarding keeps what was stored and leaves.
  await page.getByRole('link', { name: 'Read', exact: true }).click();
  await leaving.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page).toHaveURL(/#\/read$/);
  await page.goto('/#/settings/ai/text');
  await expect(keyField(page)).toHaveValue('TEST');
});

test('a model list that finishes after the key changed is ignored', async ({ page, ai }) => {
  void ai;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(listPath, async (route) => {
    await gate;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: listBody([{ name: 'models/slow-model' }]),
      });
    } catch {
      // The key changed and the page cancelled the request.
    }
  });
  await page.goto('/#/settings/ai/text');
  await keyField(page).fill('KEY-A');
  await page.getByRole('button', { name: 'Fetch models' }).click();
  await keyField(page).fill('KEY-B');
  release();
  await expect(page.getByRole('button', { name: 'Fetch models' })).toBeVisible();
  await expect(page.getByText('slow-model')).toHaveCount(0);
  await expect(page.getByText('1 models found', { exact: false })).toHaveCount(0);
});

test('the AI page fits the widest content without overflow at 1280 px', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/settings/ai/text');
  await modelField(page).fill('a-very-long-custom-model-identifier.'.repeat(6));
  await settled(page);
  expect(await overflowing(page.locator('body'))).toEqual([]);
  for (const label of ['Text AI', 'OCR', 'Speech synthesis'])
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
});

for (const theme of ['light', 'sepia', 'dark']) {
  test(`the three purpose links and a long model ID fit a 360 px phone in ${theme} @phone`, async ({ page, ai }) => {
    void ai;
    await page.addInitScript((value) => localStorage.setItem('relire_theme', value), theme);
    await page.goto('/#/settings/ai/text');
    await modelField(page).fill('gemini-'.padEnd(120, 'x'));
    await settled(page);
    for (const label of ['Text AI', 'OCR', 'Speech synthesis'])
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
    expect(await overflowing(page.locator('body'))).toEqual([]);
  });
}
