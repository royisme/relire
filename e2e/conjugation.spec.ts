/**
 * The Conjugation page (My study → Grammar): a pack verb is answered with no AI call and no key, any other verb
 * goes through a mocked `conjugate` answer, statuses and the Model/Rule pair are shown, the real error appears
 * inline, nothing moves on a request, and it renders in every theme. The AI is always mocked.
 */
import { erAnswer, EXAMPLES, parlerAnswer } from '../tests/fixtures/conjugationAnswer';
import { expect, layout, overflowing, settled, test, type MockAi } from './fixtures';
import type { Page } from '@playwright/test';
import { mockConjugationDeviceVoice } from './deviceSpeech.helpers';

const PAGE = '/#/study/grammar/conjugation';

const verbInput = (page: Page) => page.getByLabel('Verb in the infinitive');
const conjugateButton = (page: Page) => page.getByRole('button', { name: /^(Conjugate|Working…)$/ });
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

const noKey = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} })));

async function conjugate(page: Page, verb: string) {
  await verbInput(page).fill(verb);
  await verbInput(page).press('Enter');
}

const totalCalls = (ai: MockAi) => Object.values(ai.calls).reduce((sum, count) => sum + count, 0);

const withExamples = (answer: ReturnType<typeof parlerAnswer>) => ({
  ...answer,
  examples: {
    ...EXAMPLES,
    present: { fr: 'Je parle français tous les jours.', gloss: 'I speak French every day.' },
  },
});

test('a verb in the pack is answered from the pack: reviewed, no AI request, no key', async ({ page, ai }) => {
  await noKey(page);
  await page.goto(PAGE);
  await expect(page.getByText('Type a verb in the infinitive', { exact: false })).toBeVisible();
  await conjugate(page, 'aller');
  const result = page.getByRole('article', { name: 'aller' });
  await expect(result).toBeVisible();
  await expect(result.getByText('Reviewed', { exact: true })).toBeVisible();
  await expect(result.getByText('Auxiliary: être')).toBeVisible();
  await expect(section(page, 'Present').getByText('je vais', { exact: true })).toBeVisible();
  await expect(section(page, 'Imperative').getByText('va', { exact: true })).toBeVisible();
  await expect(section(page, 'Passé composé').getByText('je suis allé / suis allée', { exact: true })).toBeVisible();
  await expect(section(page, 'Participles').getByText('allé', { exact: true }).first()).toBeVisible();
  await expect(result.getByText('AI-made', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(totalCalls(ai)).toBe(0);
});

test('an irregular verb shows when each tense is used but no generic formation line', async ({ page, ai }) => {
  await noKey(page);
  await page.goto(PAGE);
  await conjugate(page, 'aller');
  const result = page.getByRole('article', { name: 'aller' });
  await expect(result.getByText('Reviewed', { exact: true })).toBeVisible();
  for (const name of ['Present', 'Passé composé', 'Imparfait', 'Future', 'Conditional', 'Subjunctive', 'Imperative']) {
    // The use line stays; the generic "how it is formed" line is gone, as it is not true for this verb.
    await expect(section(page, name).getByText(/^Use it /)).toHaveCount(1);
    await expect(section(page, name).getByText(/^(Add the|Combine the|Preceded by|Use the present tense)/)).toHaveCount(
      0,
    );
  }
  await expect(result.getByText('Add the tense endings', { exact: false })).toHaveCount(0);
  expect(totalCalls(ai)).toBe(0);
});

test('a regular -er verb keeps its formation lines; an -ir rule keeps all but the -er ones', async ({ page, ai }) => {
  ai.answer({ conjugate: parlerAnswer() });
  await page.goto(PAGE);
  await conjugate(page, 'parler');
  const parler = page.getByRole('article', { name: 'parler' });
  await expect(parler.getByText('Add the tense endings to the verb stem', { exact: false })).toBeVisible();
  await expect(parler.getByText('Use the present tense forms of tu, nous', { exact: false })).toBeVisible();

  ai.answer({ conjugate: erAnswer('finir', 'ir-issons', { plain: 'fin', strong: 'fin', fut: 'finir' }) });
  await conjugate(page, 'finir');
  const finir = page.getByRole('article', { name: 'finir' });
  await expect(finir.getByText('Add the endings -ais', { exact: false }).first()).toBeVisible();
  await expect(finir.getByText('Add the tense endings', { exact: false })).toHaveCount(0);
  await expect(finir.getByText('Use the present tense forms of tu, nous', { exact: false })).toHaveCount(0);
});

test('a regular verb outside the pack matches the rule and shows an AI-made example', async ({ page, ai }) => {
  ai.answer({ conjugate: withExamples(parlerAnswer()) });
  await page.goto(PAGE);
  await conjugate(page, 'Parler');
  const result = page.getByRole('article', { name: 'parler' });
  await expect(result.getByText('Matches the rule (not human-reviewed)')).toBeVisible();
  await expect(result.getByText('Standard -er verbs keep an unchanged stem', { exact: false })).toBeVisible();
  await expect(result.getByText('Reviewed', { exact: true })).toHaveCount(0);
  const present = section(page, 'Present');
  await expect(present.getByText('je parle', { exact: true })).toBeVisible();
  await expect(present.getByText('AI-made example')).toBeVisible();
  await expect(present.getByText('Je parle français tous les jours.')).toBeVisible();
  await expect(present.getByText('I speak French every day.')).toBeVisible();
  // Seven tenses, one example each; passé composé outside the pack is never checked.
  await expect(result.getByText('AI-made example')).toHaveCount(7);
  await expect(section(page, 'Passé composé').getByText('AI-made, not checked')).toBeVisible();
  await expect(present.getByText('AI-made, not checked')).toHaveCount(0);
  expect(ai.calls.conjugate).toBe(1);
  expect(ai.prompts.conjugate[0]).toContain('"parler"');
});

test('a wrong form shows the model line and the rule line for that cell', async ({ page, ai }) => {
  const wrong = parlerAnswer();
  wrong.forms.present['2sg'] = ['parle'];
  ai.answer({ conjugate: wrong });
  await page.goto(PAGE);
  await conjugate(page, 'parler');
  const result = page.getByRole('article', { name: 'parler' });
  await expect(result.getByText('Some forms differ from the rule')).toBeVisible();
  const cell = section(page, 'Present').getByRole('listitem').filter({ hasText: 'Model' });
  await expect(cell).toHaveCount(1);
  await expect(cell.getByText('Model')).toBeVisible();
  await expect(cell.getByText('tu parle', { exact: true })).toBeVisible();
  await expect(cell.getByText('Rule', { exact: true })).toBeVisible();
  await expect(cell.getByText('tu parles', { exact: true })).toBeVisible();
  // Every other cell is a single line.
  await expect(result.getByText('Model', { exact: true })).toHaveCount(1);
  // The rule's form is the right one and the model's is struck through, so the cell is found at a glance.
  await expect(cell.getByText('tu parles', { exact: true })).toHaveCSS('font-weight', '600');
  await expect(cell.getByText('tu parle', { exact: true })).toHaveCSS('text-decoration-line', 'line-through');
  await expect(cell.getByText('tu parles', { exact: true })).not.toHaveCSS('text-decoration-line', 'line-through');
  // The tense heading says so, and only that tense's heading.
  await expect(section(page, 'Present').getByText('Some forms differ', { exact: true })).toBeVisible();
  await expect(result.getByText('Some forms differ', { exact: true })).toHaveCount(1);
});

test('the participle labels are 14 px body text beside the 18 px forms', async ({ page }) => {
  await noKey(page);
  await page.goto(`${PAGE}?verb=aller`);
  await expect(page.getByRole('article', { name: 'aller' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const label = section(page, 'Participles').getByText('Past, masculine singular', { exact: true });
  await expect(label).toHaveCSS('font-size', '14px');
  await expect(section(page, 'Participles').getByText('allé', { exact: true }).first()).toHaveCSS('font-size', '18px');
});

test('without a key, a verb outside the pack shows the real error next to the input', async ({ page, ai }) => {
  await noKey(page);
  await page.goto(PAGE);
  await conjugate(page, 'parler');
  await expect(page.getByRole('alert')).toHaveText('API key is not set');
  await expect(page).toHaveURL(/#\/study\/grammar\/conjugation$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  expect(totalCalls(ai)).toBe(0);
});

test('an answer for another verb than asked is an error, never shown under the asked one', async ({ page, ai }) => {
  ai.answer({ conjugate: parlerAnswer() });
  await page.goto(PAGE);
  await conjugate(page, 'chanter');
  await expect(page.getByRole('alert')).toHaveText('The model answered for parler, not chanter.');
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('a failed request shows its reason and a later one replaces it', async ({ page, ai }) => {
  ai.fail(['conjugate']);
  await page.goto(PAGE);
  await conjugate(page, 'parler');
  await expect(page.getByRole('alert')).toContainText('conjugate failed');
  ai.fail([]);
  ai.answer({ conjugate: parlerAnswer() });
  await conjugate(page, 'parler');
  await expect(page.getByRole('article', { name: 'parler' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('?verb= prefills the Conjugation address and runs once for each verb', async ({ page, ai }) => {
  await noKey(page);
  await page.goto('/#/study/grammar/conjugation?verb=aller');
  await expect(verbInput(page)).toHaveValue('aller');
  await expect(page.getByRole('article', { name: 'aller' })).toBeVisible();
  expect(totalCalls(ai)).toBe(0);

  await page.goto('/#/study/grammar/conjugation?verb=s%27appeler');
  await expect(page).toHaveURL(/#\/study\/grammar\/conjugation\?verb=/);
  await expect(verbInput(page)).toHaveValue("s'appeler");
  await expect(page.getByRole('article', { name: 's’appeler' })).toBeVisible();
  expect(totalCalls(ai)).toBe(0);
});

test('?verb= for a verb outside the pack makes exactly one request', async ({ page, ai }) => {
  ai.answer({ conjugate: parlerAnswer() });
  await page.goto('/#/study/grammar/conjugation?verb=parler');
  await expect(page.getByRole('article', { name: 'parler' })).toBeVisible();
  expect(ai.calls.conjugate).toBe(1);
});

test('a newer request overtakes an older one that answers late', async ({ page, ai }) => {
  ai.answer({
    conjugate: async (prompt: string) => {
      if (!prompt.includes('"parler"'))
        return erAnswer('chanter', 'er-regular', { plain: 'chant', strong: 'chant', fut: 'chanter' });
      await new Promise((resolve) => setTimeout(resolve, 800));
      return parlerAnswer();
    },
  });
  await page.goto(PAGE);
  await conjugate(page, 'parler');
  await expect(conjugateButton(page)).toHaveAttribute('aria-busy', 'true');
  await conjugate(page, 'chanter');
  await expect(page.getByRole('article', { name: 'chanter' })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('article', { name: 'chanter' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'parler' })).toHaveCount(0);
});

test('a request moves nothing at 360 px and nothing overflows, with long forms @phone', async ({ page, ai }) => {
  const long = erAnswer('désapprovisionner', 'er-regular', {
    plain: 'désapprovisionn',
    strong: 'désapprovisionn',
    fut: 'désapprovisionner',
  });
  ai.answer({
    conjugate: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return long;
    },
  });
  await page.goto(PAGE);
  await settled(page);
  expect(await overflowing(page.locator('body'))).toEqual([]);
  const input = verbInput(page);
  const button = conjugateButton(page);
  const before = { input: await input.boundingBox(), button: await button.boundingBox(), page: await layout(page) };
  await conjugate(page, 'désapprovisionner');
  await expect(button).toHaveAttribute('aria-busy', 'true');
  expect(await input.boundingBox()).toEqual(before.input);
  expect(await button.boundingBox()).toEqual(before.button);
  expect((await layout(page)).top).toBe(before.page.top);
  await expect(page.getByRole('article', { name: 'désapprovisionner' })).toBeVisible();
  await settled(page);
  expect(await input.boundingBox()).toEqual(before.input);
  expect(await button.boundingBox()).toEqual(before.button);
  expect((await layout(page)).top).toBe(before.page.top);
  expect((await layout(page)).width).toBeLessThanOrEqual(360);
  expect(await overflowing(page.locator('body'))).toEqual([]);
  await expect(page.getByText('nous désapprovisionnerions', { exact: true })).toBeVisible();
});

test('engine endings are highlighted and shown in the rule table at 360 px @phone', async ({ page }) => {
  await noKey(page);
  await page.goto(`${PAGE}?verb=s’appeler`);
  const result = page.getByRole('article', { name: 's’appeler' });
  const present = section(page, 'Present');
  await expect(present.getByText('je m’appelle', { exact: true })).toBeVisible();
  await expect(present.getByRole('listitem').first().locator('span.underline')).toHaveText('e');
  const table = result.getByRole('table', { name: 'Rule endings' });
  await expect(table).toBeVisible();
  await expect(
    table
      .getByRole('row')
      .filter({ hasText: /^Present/ })
      .getByRole('cell')
      .nth(1),
  ).toHaveText('e');
  await expect(table.getByRole('row')).toHaveCount(7);
  expect(await overflowing(page.locator('body'))).toEqual([]);
  await conjugate(page, 'aller');
  await expect(section(page, 'Present').locator('span.underline')).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Rule endings' })).toHaveCount(0);
});

for (const viewport of ['desktop', 'phone']) {
  test(`device listening needs no key and keeps forms in place ${viewport === 'phone' ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    await mockConjugationDeviceVoice(page);
    await noKey(page);
    await page.goto(`${PAGE}?verb=aller`);
    const present = section(page, 'Present');
    const listen = present.getByRole('button', { name: 'Hear on this device: je vais', exact: true });
    await listen.scrollIntoViewIfNeeded();
    await settled(page);
    const before = { button: await listen.boundingBox(), page: await layout(page) };
    await listen.click();
    const stop = present.getByRole('button', { name: 'Stop listening: je vais', exact: true });
    await expect(stop).toBeVisible();
    expect(await stop.boundingBox()).toEqual(before.button);
    expect(await layout(page)).toEqual(before.page);
    expect(await page.evaluate(() => window.deviceSpeechTest.spoken)).toEqual(['je vais']);
    await stop.click();
    await expect(listen).toBeVisible();
    expect(await listen.boundingBox()).toEqual(before.button);

    await page.evaluate(() => {
      window.deviceSpeechTest.noFrench = true;
    });
    await listen.click();
    await expect(present.getByRole('alert')).toContainText('This device has no French voice installed');
    expect(await layout(page)).toEqual(before.page);
    expect(await present.getByRole('button', { name: /^Listen failed:/ }).boundingBox()).toEqual(before.button);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    expect(totalCalls(ai)).toBe(0);
  });
}

test('examples, participles and both differing lines have device listening controls', async ({ page, ai }) => {
  await mockConjugationDeviceVoice(page);
  const answer = withExamples(parlerAnswer());
  answer.forms.present['2sg'] = ['parle'];
  ai.answer({ conjugate: answer });
  await page.goto(`${PAGE}?verb=parler`);
  const present = section(page, 'Present');
  for (const [region, text] of [
    [present, 'tu parle'],
    [present, 'tu parles'],
    [present, 'Je parle français tous les jours.'],
    [section(page, 'Participles'), 'parlant'],
  ] as const) {
    await region.getByRole('button', { name: `Hear on this device: ${text}`, exact: true }).click();
    expect(await page.evaluate(() => window.deviceSpeechTest.spoken.at(-1))).toBe(text);
    await page.evaluate(() => window.deviceSpeechTest.finish());
    await expect(region.getByRole('button', { name: `Hear on this device: ${text}`, exact: true })).toBeVisible();
  }
  expect(ai.calls.tts).toBe(0);
  expect(ai.calls.conjugate).toBe(1);
});

for (const mode of ['light', 'sepia', 'dark']) {
  test(`renders in ${mode} with no console errors and keeps its surfaces`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((value) => localStorage.setItem('relire_theme', value), mode);
    await page.goto(PAGE);
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    await conjugate(page, 'aller');
    await expect(page.getByRole('article', { name: 'aller' })).toBeVisible();
    await settled(page);
    await expect(verbInput(page)).toHaveClass(/bg-surface/);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    expect(errors).toEqual([]);
  });
}
