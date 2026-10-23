/** Owns AI settings speech-engine choices and preview cancellation cases, not model discovery or navigation drafts. */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { keyField, modelField, saveButton } from './aiSettingsControls.helpers';

/** Records the audio elements the app creates, so a test can see which are paused. */
async function recordAudios(page: Page) {
  await page.addInitScript(() => {
    const audios: HTMLAudioElement[] = [];
    (window as unknown as { audios: HTMLAudioElement[] }).audios = audios;
    const real = window.Audio;
    window.Audio = class extends real {
      constructor(src?: string) {
        super(src);
        audios.push(this);
      }
    } as typeof Audio;
  });
}
/** The paused state of every audio element the app created, in order (elements cannot cross the bridge). */
const pausedAudios = (page: Page) =>
  page.evaluate(() => (window as unknown as { audios: HTMLAudioElement[] }).audios.map((audio) => audio.paused));

test('a preview sound stops with its request when Settings is left', async ({ page, ai }) => {
  void ai;
  ai.ttsDelayMs = 0;
  await recordAudios(page);
  await page.goto('/#/settings/ai/speech');
  await page.getByRole('button', { name: 'Preview voice' }).click();
  await expect.poll(() => pausedAudios(page)).toHaveLength(1);
  await page.getByRole('link', { name: 'Reading', exact: true }).click();
  await expect.poll(async () => (await pausedAudios(page))[0]).toBe(true);
});

test('starting a preview again interrupts the sound of the one before it', async ({ page, ai }) => {
  void ai;
  ai.ttsDelayMs = 0;
  await recordAudios(page);
  await page.goto('/#/settings/ai/speech');
  const preview = page.getByRole('button', { name: 'Preview voice' });
  await preview.click();
  await expect.poll(() => pausedAudios(page)).toHaveLength(1);
  await preview.click();
  await expect.poll(() => pausedAudios(page)).toHaveLength(2);
  await expect.poll(async () => (await pausedAudios(page))[0]).toBe(true);
  await expect.poll(async () => (await pausedAudios(page))[1]).toBe(false);
});

test('leaving Settings cancels a device preview that is still speaking', async ({ page, ai }) => {
  void ai;
  // A stand-in platform voice that speaks until something cancels it.
  await page.addInitScript(() => {
    const spoken: string[] = [];
    let cancelled = 0;
    const standin = window as unknown as { spoken: string[]; cancelled: number };
    standin.spoken = spoken;
    standin.cancelled = cancelled;
    const voices = [{ lang: 'fr-FR', name: 'Test French voice', default: true }];
    const synthesis = {
      speaking: false,
      paused: false,
      getVoices: () => voices,
      addEventListener: () => {},
      removeEventListener: () => {},
      cancel: () => {
        cancelled++;
        standin.cancelled = cancelled;
      },
      pause: () => {},
      resume: () => {},
      speak: (utterance: { text: string }) => {
        spoken.push(utterance.text);
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
  const counter = (page: Page) => page.evaluate(() => (window as unknown as { cancelled: number }).cancelled);
  await page.goto('/#/settings/ai/speech');
  await page.getByLabel('Provider').selectOption('device');
  // An unsaved draft would ask before leaving; save so leaving Settings really happens.
  await saveButton(page).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview voice' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toHaveLength(1);
  // The preview's own setup cancels once; leaving the page must cancel the speaking preview itself.
  const before = await counter(page);
  await page.getByRole('link', { name: 'Reading', exact: true }).click();
  await expect.poll(() => counter(page)).toBeGreaterThan(before);
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
    .toEqual(['Bonjour ! Bienvenue sur Relire Plus.']);
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
