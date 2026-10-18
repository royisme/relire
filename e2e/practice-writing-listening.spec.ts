/**
 * The writing and listening controls: SENTENCE_BUILD (tiles; an arrangement
 * that matches the reference is graded at once, any other goes to the AI
 * grader), READING_CLOZE (the passage beside the questions on desktop, above
 * them on phones, with a link into the reader) and NUMBER_DICTATION (Listen at
 * the dictation speed, then type what was heard), plus the Settings → Practice
 * section those preferences live in. Answered right and wrong from the
 * catalogue fixtures, at 1280px and 360px.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, overflowing, test, type MockAi } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

const units = CATALOG_EXERCISES.units.filter((unit) =>
  ['unit-sentence-build', 'unit-reading-cloze', 'unit-number-dictation', 'unit-word-transform'].includes(unit.id),
);

const struck = (field: Locator) => expect(field).toHaveCSS('text-decoration-line', 'line-through');
const fits = (page: Page) => overflowing(page.locator('body')).then((out) => expect(out).toEqual([]));

/** Every clip in the audio store, so a spoken number is seen to be synthesized once and kept. */
type Db = typeof import('../src/storage/db');
const audioClips = (page: Page) =>
  page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    return (await (await db()).getAll('audio')).length;
  });

test.beforeEach(async ({ page, ai }) => {
  void ai; // onboards the app with a test key and answers every AI request from fixtures
  await seedUnits(page, units);
});

async function sentenceBuild(page: Page, ai: MockAi, phone: boolean) {
  await openUnit(page, 'unit-sentence-build', 'Reformuler une idée');
  const one = row(page, 'Dites que le blé');
  const sentence = one.getByRole('group', { name: 'Item 1, your sentence' });
  const bank = one.getByRole('group', { name: 'Item 1, word tiles' });
  await expect(checkButton(one)).toBeDisabled();
  if (phone) {
    const box = await bank.getByRole('button').first().boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(40);
  }

  // Tiles in the reference order: a match is graded at once, with no AI call.
  for (const word of ['Le', 'blé', 'pour', 'moi', 'est', 'inutile.'])
    await bank.getByRole('button', { name: word, exact: true }).click();
  await expect(sentence.getByRole('button')).toHaveCount(6);
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  expect(ai.calls.grade).toBe(0);
  const { attempts } = await stored(page);
  expect(attempts.find((a: { itemId: string }) => a.itemId === 'sb-1')).toMatchObject({
    userAnswer: 'Le blé pour moi est inutile.',
    correct: true,
  });

  // After a reset, the same words in another order go to the AI grader: words, never a score.
  // The catalogue grades only qa-1, so this spec supplies the verdict for sb-1.
  ai.answer({
    grade: {
      isCorrect: false,
      feedback: 'The words are all there, but this order does not say the idea of the sentence.',
      correctedVersion: 'Le blé pour moi est inutile.',
    },
  });
  await page.getByRole('button', { name: 'Reset this unit' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  for (const word of ['moi', 'Le', 'blé', 'pour', 'est', 'inutile.'])
    await bank.getByRole('button', { name: word, exact: true }).click();
  await checkButton(one).click();
  await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
  await expect(one.getByText('AI feedback.')).toBeVisible();
  expect(ai.calls.grade).toBe(1);
  await expect(one.getByText('Sample answer')).toBeVisible();
  await expect(one.getByText('Le blé pour moi est inutile.').last()).toBeVisible();
  await fits(page);
}

async function readingCloze(page: Page, phone: boolean) {
  await openUnit(page, 'unit-reading-cloze', 'Compléter le passage');
  const passage = page
    .locator('section')
    .filter({ has: page.getByRole('link', { name: 'Open in the reader' }) })
    .last();
  const questions = page.locator('main ol');
  await expect(page.getByRole('heading', { name: 'Le renard et les poules' })).toBeVisible();
  await expect(page.getByText('Ma vie est monotone. Je chasse les poules')).toBeVisible();

  // The passage sits beside the questions on a desktop and above them on a phone.
  const p = (await passage.boundingBox())!;
  const q = (await questions.boundingBox())!;
  if (phone) {
    expect(p.y + p.height).toBeLessThanOrEqual(q.y + 1);
  } else {
    expect(p.x + p.width).toBeLessThanOrEqual(q.x + 1);
    expect(p.y + p.height).toBeGreaterThan(q.y);
  }

  const one = row(page, 'Le renard dit');
  await expect(checkButton(one)).toBeDisabled();
  const [first, second] = [one.getByRole('textbox').nth(0), one.getByRole('textbox').nth(1)];
  await first.fill('chasse');
  await second.fill('chassent');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();

  const two = row(page, 'donc un peu');
  await two.getByRole('textbox').fill('ennuies');
  await checkButton(two).click();
  await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
  await struck(two.getByRole('textbox'));
  await expect(two.getByText('ennuie', { exact: true })).toBeVisible();
  await fits(page);

  // The passage opens its own stored text, not the parent material’s prose.
  await page.getByRole('link', { name: 'Open in the reader' }).click();
  await expect(page).toHaveURL(/#\/passage\/petit-prince\/unit-reading-cloze$/);
  await expect(page.locator('article [data-sentence]').first()).toBeVisible();
}

async function numberDictation(page: Page, ai: MockAi, phone: boolean) {
  await openUnit(page, 'unit-number-dictation', 'Les nombres');
  const items = row(page, 'Écoutez et écrivez');
  const one = items.first();
  const two = items.nth(1);
  await expect(checkButton(one)).toBeDisabled();
  if (phone) {
    const box = await one.getByRole('button', { name: 'Listen' }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(40);
  }

  // Listen synthesizes the clip once and stores it; the answer is typed, not shown.
  await one.getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => ai.calls.tts).toBe(1);
  await one.getByRole('textbox').fill('cent mille');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();

  await two.getByRole('textbox').fill('dix-neuf');
  await checkButton(two).click();
  await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
  await struck(two.getByRole('textbox'));
  await expect(two.getByText('dix-huit', { exact: true })).toBeVisible();
  await fits(page);
  // Nothing was spoken for the second item: speaking after a check is off by default.
  await expect.poll(() => audioClips(page)).toBe(1);
  await page.waitForTimeout(400);
  expect(ai.calls.tts).toBe(1);
  expect(await audioClips(page)).toBe(1);
  const { attempts } = await stored(page);
  expect(attempts.find((a: { itemId: string }) => a.itemId === 'nd-2')).toMatchObject({
    userAnswer: 'dix-neuf',
    expectedAnswer: 'dix-huit',
    correct: false,
  });
}

for (const phone of [false, true]) {
  const suffix = phone ? ' @phone' : '';

  test(`sentence build: the reference arrangement is graded at once, another goes to the AI${suffix}`, async ({
    page,
    ai,
  }) => {
    await sentenceBuild(page, ai, phone);
  });

  test(`reading cloze: the passage stays in sight beside or above the questions${suffix}`, async ({ page }) => {
    await readingCloze(page, phone);
  });

  test(`number dictation: listen at the dictation speed, then type what was heard${suffix}`, async ({ page, ai }) => {
    await numberDictation(page, ai, phone);
  });
}

test('Enter places and takes back a tile', async ({ page }) => {
  await openUnit(page, 'unit-sentence-build', 'Reformuler une idée');
  const one = row(page, 'Dites que le blé');
  const sentence = one.getByRole('group', { name: 'Item 1, your sentence' });
  const bank = one.getByRole('group', { name: 'Item 1, word tiles' });
  await bank.getByRole('button', { name: 'Le', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(sentence).toContainText('Le');
  await sentence.getByRole('button', { name: 'Remove Le' }).focus();
  await page.keyboard.press('Enter');
  await expect(sentence).toContainText('Build the sentence with the tiles below.');
});

/** A stand-in platform voice that records what it was asked to speak (the provider stays untouched).
 *  Drops the page first: a hash-only move from here on is a same-document navigation, which would not
 *  run a newly added init script. */
async function mockDeviceVoice(page: Page) {
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
  await page.goto('about:blank');
}

const spokenByDevice = (page: Page) => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken);

/** Writes the automatic-playback preferences straight into storage, before the sheet opens. */
const setAutoSpeak = (page: Page, speak: boolean, remote: boolean, provider = 'gemini') =>
  page.evaluate(
    ({ speak, remote, provider }) => {
      const raw: Record<string, unknown> = JSON.parse(localStorage.getItem('relire_app_settings_v1') || '{}');
      raw.practiceSpeakAfterCheck = speak;
      raw.practiceRemoteAutoSpeak = remote;
      raw.speechProvider = provider;
      if (provider === 'device') {
        raw.speechModel = '';
        raw.speechVoice = '';
      }
      localStorage.setItem('relire_app_settings_v1', JSON.stringify(raw));
    },
    { speak, remote, provider },
  );

test('speak after checking replays the dictation once the remote opt-in is on', async ({ page, ai }) => {
  await setAutoSpeak(page, true, true);
  await openUnit(page, 'unit-number-dictation', 'Les nombres');
  const one = row(page, 'Écoutez et écrivez').first();
  await one.getByRole('textbox').fill('cent mille');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  await expect.poll(() => ai.calls.tts).toBe(1);
});

test('with the remote opt-in off, a check replays the dictation with the device voice', async ({ page, ai }) => {
  await setAutoSpeak(page, true, false);
  await mockDeviceVoice(page);
  await openUnit(page, 'unit-number-dictation', 'Les nombres');
  const one = row(page, 'Écoutez et écrivez').first();
  await one.getByRole('textbox').fill('cent mille');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  // The device voice says the number; the provider synthesized nothing and no clip was stored.
  await expect.poll(() => spokenByDevice(page)).toEqual(['cent mille']);
  await page.waitForTimeout(300);
  expect(ai.calls.tts).toBe(0);
  expect(await audioClips(page)).toBe(0);
});

test('with the master preference off, a check says nothing at all', async ({ page, ai }) => {
  await setAutoSpeak(page, false, true);
  await mockDeviceVoice(page);
  await openUnit(page, 'unit-number-dictation', 'Les nombres');
  const one = row(page, 'Écoutez et écrivez').first();
  await one.getByRole('textbox').fill('cent mille');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  await page.waitForTimeout(300);
  expect(await spokenByDevice(page)).toEqual([]);
  expect(ai.calls.tts).toBe(0);
  expect(await audioClips(page)).toBe(0);
});

test('the device engine replays after a check with no opt-in at all', async ({ page, ai }) => {
  await setAutoSpeak(page, true, false, 'device');
  await mockDeviceVoice(page);
  await openUnit(page, 'unit-number-dictation', 'Les nombres');
  const one = row(page, 'Écoutez et écrivez').first();
  await one.getByRole('textbox').fill('cent mille');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  await expect.poll(() => spokenByDevice(page)).toEqual(['cent mille']);
  await page.waitForTimeout(300);
  expect(ai.calls.tts).toBe(0);
});

test('a failed remote Listen shows its real reason and never speaks the device voice', async ({ page, ai }) => {
  await mockDeviceVoice(page);
  ai.fail(['tts']);
  await openUnit(page, 'unit-number-dictation', 'Les nombres');
  const one = row(page, 'Écoutez et écrivez').first();
  await one.getByRole('button', { name: 'Listen' }).click();
  // The control itself reports the provider's real error, at its fixed size, and no engine is substituted.
  await expect(one.getByRole('alert')).toContainText('Listen failed');
  await expect(one.getByRole('alert')).toContainText('tts failed');
  await page.waitForTimeout(300);
  expect(await spokenByDevice(page)).toEqual([]);
});

test('the Practice section saves its own slice and strict accents changes the verdict', async ({ page }) => {
  await page.goto('/#/settings/practice');
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();

  await page.getByRole('checkbox', { name: 'Strict accents' }).check();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: '1×' }).click();
  await save.click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('relire_app_settings_v1') || '{}'));
  expect(settings.practiceStrictAccents).toBe(true);
  expect(settings.practiceDictationSpeed).toBe(1);
  expect(settings.practiceSpeakAfterCheck).toBe(false);
  // The AI settings are another section's slice and stay as they were.
  expect(settings.apiKeys.gemini).toBe('TEST');
  expect(settings.textProvider).toBe('gemini');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Strict accents' })).toBeChecked();
  await expect(page.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');

  // With strict accents on, a missing accent is now wrong (the default accepts it).
  await openUnit(page, 'unit-word-transform', 'Le féminin des adjectifs');
  const one = row(page, 'intrigué');
  await one.getByRole('textbox').fill('intrigué');
  await checkButton(one).click();
  await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
  await expect(one.getByText('intriguée', { exact: true })).toBeVisible();
});
