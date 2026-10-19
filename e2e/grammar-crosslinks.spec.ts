/** Grammar-tag cross-links use synthetic TEST topics only; history comes from real UI checks. */
import type { Locator, Page } from '@playwright/test';
import { expect, settled, test } from './fixtures';
import { openListedUnit, row, seedUnits } from './practice.helpers';
import { topicFixture, topicsFixture } from '../tests/fixtures/grammarTopics';
import type { GrammarTag } from '../src/types/grammar';
import type { GrammarTagIndex } from '../src/types/grammarTagIndex';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import zh from '../src/i18n/locales/zh.json' with { type: 'json' };

import { CONTENT_ORIGIN, INDEX_REQUEST, mockIndex, mockTopics as mockTopicService } from './contentService.helpers';
const INDEX: GrammarTagIndex = { present: ['test-only'], 'hypothesis-si': ['another-test', 'third-test'] };
const UNIT = 'unit-fill-blanks';
const tags = ['present', 'hypothesis-si', 'adjective-agreement'] as const;
const direct = '#/study/grammar/test-only';
const filtered = '#/study/grammar?tag=hypothesis-si';
type Copy = typeof en | typeof zh;

function testPack() {
  const pack = topicsFixture();
  pack.topics[0].tags = ['present'];
  for (const id of ['another-test', 'third-test']) {
    const topic = topicFixture();
    topic.id = id;
    topic.tags = ['hypothesis-si'];
    pack.topics.push(topic);
  }
  return pack;
}
async function mockTopics(page: Page) {
  await mockTopicService(page, testPack());
}
async function go(page: Page, href: string, copy: Copy = en) {
  if (href === '#/study/mistakes' && !(await page.locator(`a[href="${href}"]`).first().isVisible())) {
    await go(page, '#/study/words', copy);
  }
  const link = page.locator(`a[href="${href}"]`).first();
  if (!(await link.isVisible())) await page.getByRole('button', { name: copy.nav.menu, exact: true }).click();
  await page.locator(`a[href="${href}"]`).filter({ visible: true }).first().click();
}
async function openPractice(page: Page, copy: Copy = en) {
  await go(page, '#/practice', copy);
  await openListedUnit(page, 'set-1', UNIT);
}
async function wrong(item: Locator, copy: Copy = en) {
  await expect(item.getByRole('textbox').first()).toBeVisible();
  for (const input of await item.getByRole('textbox').all()) await input.fill('TEST WRONG');
  await item.getByRole('button', { name: copy.practice.check, exact: true }).click();
  await expect(item.getByText(copy.practice.wrong, { exact: true })).toBeAttached();
}
async function history(page: Page, copy: Copy = en) {
  await openPractice(page, copy);
  await wrong(row(page, 'Je ne'), copy);
  await wrong(row(page, 'Si tu'), copy);
  await go(page, '#/practice', copy);
  await openListedUnit(page, 'set-1', 'unit-word-transform');
  await wrong(row(page, 'intrigué'), copy);
}
function notebookRow(page: Page, tag: GrammarTag, copy: Copy = en) {
  return page.locator('main li').filter({ has: page.getByText(copy.grammarTags[tag], { exact: true }) });
}
function targetSentence(page: Page, copy: Copy = en) {
  return page.locator('main p').filter({ hasText: copy.adaptive.targets.split('{{tags}}')[0] });
}
async function label(scope: Locator, tag: GrammarTag, published: boolean, copy: Copy = en) {
  const name = copy.grammarTags[tag];
  await expect(scope.getByText(name, { exact: true }).last()).toBeVisible();
  const link = scope.getByRole('link', { name, exact: true });
  if (published && tag !== 'adjective-agreement') {
    await expect(link).toHaveAttribute('href', tag === 'present' ? direct : filtered);
  } else await expect(link).toHaveCount(0);
}
async function destination(page: Page, tag: GrammarTag, copy: Copy = en) {
  await expect(page).toHaveURL(
    new RegExp(tag === 'present' ? '#/study/grammar/test-only$' : '#/study/grammar\\?tag=hypothesis-si$'),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (tag === 'present') await expect(page.getByRole('article')).toBeVisible();
  else {
    await expect(
      page.getByRole('link', {
        name: copy.grammarTopics.clearTag.replace('{{tag}}', copy.grammarTags['hypothesis-si']),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('[data-grammar-topics] li')).toHaveCount(2);
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

for (const phone of [false, true]) {
  test(`published links at all four sites and Progress; uncovered tags stay plain ${phone ? 'zh @phone' : 'en'}`, async ({
    page,
  }) => {
    const copy = phone ? zh : en;
    if (phone) await page.addInitScript(() => localStorage.setItem('relire_lang', 'zh'));
    const modules: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith(CONTENT_ORIGIN)) modules.push(request.url());
    });
    await mockTopics(page);
    await mockIndex(page, INDEX);
    await seedUnits(page);
    expect(modules).toEqual([]);
    await history(page, copy);
    await label(row(page, 'intrigué'), 'adjective-agreement', true, copy);
    await row(page, 'intrigué').getByRole('button', { name: copy.practice.explain, exact: true }).click();
    await label(page.getByRole('dialog'), 'adjective-agreement', true, copy);
    await page.keyboard.press('Escape');
    await go(page, '#/practice', copy);
    await openListedUnit(page, 'set-1', UNIT);
    // Source labels request only the index, never summaries or topic content.
    expect(modules.some((url) => url.includes('/v1/topics'))).toBe(false);
    for (const [tag, prompt] of [
      ['present', 'Je ne'],
      ['hypothesis-si', 'Si tu'],
    ] as const) {
      const item = row(page, prompt);
      await label(item, tag, true, copy);
      await item.getByRole('link', { name: copy.grammarTags[tag], exact: true }).click();
      await destination(page, tag, copy);
      await page.goBack();
      await item.getByRole('button', { name: copy.practice.explain, exact: true }).click();
      await label(page.getByRole('dialog'), tag, true, copy);
      await page.getByRole('dialog').getByRole('link', { name: copy.grammarTags[tag], exact: true }).click();
      await destination(page, tag, copy);
      await page.goBack();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await go(page, '#/study/mistakes', copy);
    for (const tag of tags) {
      const entry = notebookRow(page, tag, copy);
      await label(entry, tag, true, copy);
      if (tag !== 'adjective-agreement') {
        await entry.getByRole('link', { name: copy.grammarTags[tag], exact: true }).click();
        await destination(page, tag, copy);
        await page.goBack();
      }
      await entry.getByRole('button', { name: copy.practice.explain, exact: true }).click();
      await label(page.getByRole('dialog'), tag, true, copy);
      if (tag === 'adjective-agreement') await page.keyboard.press('Escape');
      else {
        await page.getByRole('dialog').getByRole('link', { name: copy.grammarTags[tag], exact: true }).click();
        await destination(page, tag, copy);
        await page.goBack();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    }
    await go(page, '#/progress', copy);
    for (const tag of tags) await label(targetSentence(page, copy), tag, true, copy);
    const labels = tags.map((tag) => copy.grammarTags[tag]);
    const sentence = await targetSentence(page, copy).textContent();
    for (const literal of new Intl.ListFormat(phone ? 'zh' : 'en', { style: 'long', type: 'conjunction' })
      .formatToParts(labels)
      .filter((part) => part.type === 'literal'))
      expect(sentence).toContain(literal.value);
    await noOverflow(page);
    for (const tag of ['present', 'hypothesis-si'] as const) {
      await targetSentence(page, copy).getByRole('link', { name: copy.grammarTags[tag], exact: true }).click();
      await destination(page, tag, copy);
      await page.goBack();
    }
    console.log('OBSERVED CONTENT SERVICE URLS', [...new Set(modules)]);
  });
}

for (const failure of [false, true]) {
  test(`${failure ? 'failed index' : 'empty service index'} leaves every source label plain without error noise`, async ({
    page,
  }) => {
    const noise: string[] = [];
    const modules: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith(CONTENT_ORIGIN)) modules.push(request.url());
    });
    page.on('console', (message) => {
      if (message.type() === 'error') noise.push(message.text());
    });
    page.on('pageerror', (error) => noise.push(error.message));
    if (failure)
      await page.route(INDEX_REQUEST, (route) =>
        route.fulfill({
          json: { 'TEST ONLY invalid tag': ['test-only'] },
        }),
      );
    await seedUnits(page);
    expect(modules).toEqual([]);
    await history(page);
    await label(row(page, 'intrigué'), 'adjective-agreement', false);
    await go(page, '#/practice');
    await openListedUnit(page, 'set-1', UNIT);
    await label(row(page, 'Je ne'), 'present', false);
    await row(page, 'Je ne').getByRole('button', { name: en.practice.explain, exact: true }).click();
    await label(page.getByRole('dialog'), 'present', false);
    await page.keyboard.press('Escape');
    await go(page, '#/study/mistakes');
    await label(notebookRow(page, 'present'), 'present', false);
    await notebookRow(page, 'present').getByRole('button', { name: en.practice.explain, exact: true }).click();
    await label(page.getByRole('dialog'), 'present', false);
    await page.keyboard.press('Escape');
    await go(page, '#/progress');
    for (const tag of tags) await label(targetSentence(page), tag, false);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(noise).toEqual([]);
    expect(modules.some((url) => url.includes('/v1/tag-index'))).toBe(true);
    expect(modules.some((url) => url.includes('/v1/topics'))).toBe(false);
  });
}

test('offline tag-index fallback restores links after one successful load', async ({ page }) => {
  await mockIndex(page, INDEX);
  await seedUnits(page);
  await openPractice(page);
  await label(row(page, 'Je ne'), 'present', true);
  let requests = 0;
  await page.route(INDEX_REQUEST, (route) => {
    requests++;
    return route.abort('failed');
  });
  await page.reload();
  await label(row(page, 'Je ne'), 'present', true);
  expect(requests).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const site of ['item', 'notebook', 'practice-sheet', 'notebook-sheet', 'progress']) {
  test(`delayed index keeps ${site} label and surrounding header still @phone`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route(INDEX_REQUEST, async (route) => {
      requested = true;
      await held;
      await route.fulfill({ json: INDEX });
    });
    await seedUnits(page);
    await openPractice(page);
    const item = row(page, 'Je ne');
    await expect.poll(() => requested).toBe(true);
    let scope = item;
    let header = item.locator('p').first().locator('..');
    if (site !== 'item') {
      await wrong(item);
      if (site === 'practice-sheet') await item.getByRole('button', { name: en.practice.explain, exact: true }).click();
      else {
        await go(page, site === 'progress' ? '#/progress' : '#/study/mistakes');
        if (site === 'notebook-sheet')
          await notebookRow(page, 'present').getByRole('button', { name: en.practice.explain, exact: true }).click();
      }
      if (site.endsWith('sheet')) {
        scope = page.getByRole('dialog');
        header = scope.locator(':scope > div').first();
      } else if (site === 'notebook') {
        scope = notebookRow(page, 'present');
        header = scope.locator('div').first();
      } else {
        scope = targetSentence(page);
        header = scope;
      }
    }
    await settled(page);
    await scope.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    await label(scope, 'present', false);
    const textBox = await scope.getByText(en.grammarTags.present, { exact: true }).last().boundingBox();
    const headerBox = await header.boundingBox();
    expect(textBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    release();
    await label(scope, 'present', true);
    expect(await scope.getByRole('link', { name: en.grammarTags.present, exact: true }).boundingBox()).toEqual(textBox);
    expect(await header.boundingBox()).toEqual(headerBox);
    await noOverflow(page);
  });
}
