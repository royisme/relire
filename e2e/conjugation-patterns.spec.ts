/**
 * CP6 pattern selection, fixed layout and availability in every theme and at 360 px.
 * Owns browser assertions only; any AI needed for a source grid is mocked.
 */
import type { Locator, Page } from '@playwright/test';
import { erAnswer, falloirAnswer, parlerAnswer } from '../tests/fixtures/conjugationAnswer';
import { expect, overflowing, settled, test } from './fixtures';

const section = (page: Page) => page.getByRole('region', { name: 'Patterns', exact: true });
const row = (page: Page, name: string) =>
  section(page)
    .locator('dl > div')
    .filter({ has: page.getByText(name, { exact: true }) });
const tense = (page: Page) => section(page).getByRole('combobox', { name: 'Tense', exact: true });
const person = (page: Page) => section(page).getByRole('combobox', { name: 'Person', exact: true });

async function select(page: Page, control: Locator, name: string) {
  await control.click();
  await page.getByRole('option', { name, exact: true }).click();
}

// Document coordinates, not viewport coordinates: a browser's focus scroll is not a layout shift.
async function boxes(page: Page) {
  return page.evaluate(() => {
    const patterns = document.querySelector('section[aria-label="Patterns"]')!;
    return [patterns, ...patterns.querySelectorAll('[role="combobox"]'), patterns.nextElementSibling!].map((el) => {
      const box = el.getBoundingClientRect();
      return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
    });
  });
}

for (const mode of ['light', 'sepia', 'dark']) {
  for (const size of ['desktop', 'phone']) {
    test(`CP6 pack patterns in ${mode}, stable controls and rows ${size === 'phone' ? '@phone' : ''}`, async ({
      page,
      ai,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript((theme) => {
        localStorage.setItem('relire_theme', theme);
        localStorage.setItem('relire_lang', 'en');
        localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} }));
      }, mode);
      await page.goto('/#/grammar/conjugation?verb=aller');
      await expect(section(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await section(page).scrollIntoViewIfNeeded();
      await settled(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await expect(section(page).locator('dt')).toHaveText([
        'Negation',
        'Question with est-ce que',
        'Question with inversion',
      ]);
      await expect(tense(page)).toHaveText('Present');
      await expect(person(page)).toHaveText('I');
      await expect(row(page, 'Negation').locator('dd')).toHaveText('je ne vais pas');
      await expect(row(page, 'Question with est-ce que').locator('dd')).toHaveText('est-ce que je vais\u00a0?');
      await expect(row(page, 'Question with inversion').locator('dd')).toHaveText(
        '— Inversion is rarely used with je; use est-ce que.',
      );
      expect(await row(page, 'Question with est-ce que').locator('dd').textContent()).toBe('est-ce que je vais\u00a0?');
      const before = await boxes(page);
      await tense(page).click();
      expect(await boxes(page)).toEqual(before);
      await page.getByRole('option', { name: 'Passé composé', exact: true }).click();
      await expect(row(page, 'Negation').locator('dd')).toHaveText('je ne suis pas allé / allée');
      await expect(row(page, 'Question with est-ce que').locator('dd')).toHaveText(
        'est-ce que je suis allé / allée\u00a0?',
      );
      expect(await boxes(page)).toEqual(before);
      await select(page, person(page), 'he, she');
      await expect(row(page, 'Question with inversion').locator('dd')).toHaveText(
        'est-il allé\u00a0? / est-elle allée\u00a0?',
      );
      await expect(row(page, 'Negation').locator('dd')).toHaveText('il/elle n’est pas allé / allée');
      expect(await boxes(page)).toEqual(before);
      await select(page, tense(page), 'Present');
      await expect(row(page, 'Question with inversion').locator('dd')).toHaveText('va-t-il\u00a0? / va-t-elle\u00a0?');
      await select(page, tense(page), 'Imperative');
      await expect(person(page)).toHaveText('you (singular)');
      await person(page).click();
      await expect(page.getByRole('option')).toHaveText(['you (singular)', 'we', 'you (plural or formal)']);
      await page.getByRole('option', { name: 'we', exact: true }).click();
      await expect(row(page, 'Negation').locator('dd')).toHaveText('n’allons pas');
      await expect(row(page, 'Question with est-ce que').locator('dd')).toHaveText('— No questions for this tense.');
      await expect(row(page, 'Question with inversion').locator('dd')).toHaveText('— No questions for this tense.');
      expect(await boxes(page)).toEqual(before);
      await select(page, tense(page), 'Subjunctive');
      await expect(row(page, 'Negation').locator('dd')).toHaveText('que nous n’allions pas');
      await expect(row(page, 'Question with inversion').locator('dd')).toHaveText('— No questions for this tense.');
      expect(await boxes(page)).toEqual(before);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(Object.values(ai.calls).reduce((sum, count) => sum + count, 0)).toBe(0);
      expect(errors).toEqual([]);
    });
  }
}

test('CP6 each pattern row reserves the height of a two-line sentence and its note, and no more', async ({
  page,
  ai,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('relire_lang', 'en');
    localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} }));
  });
  await page.goto('/#/grammar/conjugation?verb=aller');
  await expect(section(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  const measure = () =>
    page.evaluate(() => {
      const patterns = document.querySelector('section[aria-label="Patterns"]')!;
      const rows = [...patterns.querySelectorAll('dl > div')];
      const last = rows.at(-1)!.getBoundingClientRect();
      return {
        heights: rows.map((row) => row.getBoundingClientRect().height),
        scrolls: rows.map((row) => row.scrollHeight > row.clientHeight),
        // Section bottom minus its last row's bottom is its 20px padding: no reserved blank below the rows.
        below: patterns.getBoundingClientRect().bottom - last.bottom,
      };
    });
  const before = await measure();
  expect(before.heights).toEqual([125, 125, 125]);
  expect(before.scrolls).toEqual([false, false, false]);
  expect(before.below).toBe(20);
  await select(page, tense(page), 'Subjunctive');
  expect(await measure()).toEqual(before);
  expect(Object.values(ai.calls).reduce((sum, count) => sum + count, 0)).toBe(0);
});

test('CP6 patterns inherit unchecked and differing cell notes without another request', async ({ page, ai }) => {
  const answer = parlerAnswer();
  answer.forms.present['2sg'] = ['parle'];
  ai.answer({ conjugate: answer });
  await page.goto('/#/grammar/conjugation?verb=parler');
  await expect(section(page)).toBeVisible();
  await expect(section(page).getByText('AI-made, not checked', { exact: true })).toHaveCount(0);
  await select(page, person(page), 'you (singular)');
  await expect(section(page).getByText('AI-made; this cell differs from the rule.')).toHaveCount(3);
  await select(page, tense(page), 'Passé composé');
  await expect(section(page).getByText('AI-made, not checked', { exact: true })).toHaveCount(3);
  expect(ai.calls.conjugate).toBe(1);
});

test('CP6 a defective verb offers only its available person and no imperative', async ({ page, ai }) => {
  ai.answer({ conjugate: falloirAnswer() });
  await page.goto('/#/grammar/conjugation?verb=falloir');
  await expect(section(page)).toBeVisible();
  await expect(row(page, 'Negation').locator('dd p').first()).toHaveText('il ne faut pas');
  await person(page).click();
  await expect(page.getByRole('option')).toHaveText(['it (impersonal)']);
  await page.keyboard.press('Escape');
  await tense(page).click();
  await expect(page.getByRole('option')).toHaveCount(6);
  await expect(page.getByRole('option', { name: 'Imperative', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(ai.calls.conjugate).toBe(1);
});

test('CP6 long pattern variants stay inside their fixed row at 360 px @phone', async ({ page, ai }) => {
  const answer = erAnswer('désapprovisionner', 'er-regular', {
    plain: 'désapprovisionn',
    strong: 'désapprovisionn',
    fut: 'désapprovisionner',
  });
  answer.forms.conditionnel['3pl'] = ['désapprovisionneraient', 'désapprovisionneront'];
  ai.answer({ conjugate: answer });
  await page.goto('/#/grammar/conjugation?verb=désapprovisionner');
  await expect(section(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  const before = await boxes(page);
  await select(page, tense(page), 'Conditional');
  await select(page, person(page), 'they');
  await expect(row(page, 'Question with inversion').locator('dd p').first()).toHaveText(
    'désapprovisionneraient-ils\u00a0? / désapprovisionneraient-elles\u00a0? / désapprovisionneront-ils\u00a0? / désapprovisionneront-elles\u00a0?',
  );
  expect(await boxes(page)).toEqual(before);
  expect(await overflowing(page.locator('body'))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
