/** Topics use a fake service with test-only pack data, never teaching content or a real provider. */
import type { Page } from '@playwright/test';
import { expect, layout, settled, test } from './fixtures';
import { topicFixture, topicsFixture } from '../tests/fixtures/grammarTopics';
import type { GrammarTopicsPack } from '../src/types/grammarTopic';
import zh from '../src/i18n/locales/zh.json' with { type: 'json' };

import { mockTopics, TOPICS_REQUEST } from './contentService.helpers';
const LIST = '/#/study/grammar';

function testPack(): GrammarTopicsPack {
  const pack = topicsFixture();
  const topic = pack.topics[0];
  topic.title.en = 'TEST TOPIC';
  topic.blocks[0] = {
    type: 'paragraph',
    heading: { ...topic.title, en: 'TEST HEADING' },
    text: { ...topic.title, en: 'TEST PARAGRAPH' },
  };
  topic.blocks[1] = { type: 'rules', items: [{ ...topic.title, en: 'TEST RULE' }] };
  const table = topic.blocks[2];
  if (table.type === 'table') {
    table.header[0].en = 'TEST COLUMN';
    table.rows[0][1].fr = 'TEST '.repeat(30).trim();
  }
  topic.blocks[4] = { type: 'note', text: { ...topic.title, en: 'TEST NOTE' } };
  const other = topicFixture();
  other.id = 'another-test';
  other.chapter = 'another-test';
  other.title.en = 'ANOTHER TEST TOPIC';
  other.tags = ['present'];
  other.level = 'B1';
  const examples = other.blocks[3];
  if (examples.type === 'examples') {
    examples.items[0].speaker = 'A';
    examples.items[1].speaker = 'B';
  }
  pack.topics.push(other);
  return pack;
}

async function mockPack(page: Page, pack = testPack()) {
  await mockTopics(page, pack);
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

test('the empty service list says that no topics are published', async ({ page }) => {
  await page.goto(LIST);
  await expect(page.getByText('No topics are published yet.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-grammar-topics] a')).toHaveCount(0);
});

test('list groups by chapter, shows levels and reads every block kind', async ({ page }) => {
  await mockPack(page);
  await page.goto(LIST);
  for (const chapter of ['test-only', 'another-test'])
    await expect(page.getByRole('heading', { name: chapter, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /TEST TOPIC A1/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /ANOTHER TEST TOPIC B1/ })).toBeVisible();
  await page.getByRole('link', { name: /TEST TOPIC A1/ }).click();
  await expect(page).toHaveURL(/#\/study\/grammar\/test-only$/);
  const article = page.getByRole('article');
  await expect(article.getByRole('heading', { name: 'TEST TOPIC', exact: true })).toBeVisible();
  await expect(article.getByRole('heading', { name: 'TEST HEADING', exact: true })).toBeVisible();
  for (const text of ['TEST PARAGRAPH', 'TEST RULE', 'TEST NOTE'])
    await expect(article.getByText(text, { exact: true })).toBeVisible();
  await expect(article.getByRole('columnheader', { name: 'TEST COLUMN', exact: true })).toBeVisible();
  await expect(article.getByRole('rowheader', { name: 'TEST TEST ONLY', exact: true })).toBeVisible();
  await expect(article.locator('li [lang="fr"]')).toHaveCount(2);
  await page.getByRole('link', { name: 'Back to Topics', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/grammar$/);
  await page.getByRole('link', { name: /ANOTHER TEST TOPIC B1/ }).click();
  await expect(page.getByRole('article').getByText('A : TEST', { exact: true })).toBeVisible();
  await expect(page.getByRole('article').getByText('B : TEST', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ANOTHER TEST TOPIC', exact: true })).toBeVisible();
});

test('tag filter and dismissible chip are route-owned, including no-match and invalid tags', async ({ page }) => {
  await mockPack(page);
  await page.goto(`${LIST}?tag=articles`);
  await expect(page.getByRole('link', { name: /TEST TOPIC A1/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /ANOTHER TEST TOPIC/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Clear tag filter: Articles', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/grammar$/);
  await expect(page.getByRole('link', { name: /ANOTHER TEST TOPIC/ })).toBeVisible();
  await page.goto(`${LIST}?tag=negation`);
  await expect(page.getByText('No published topics match this tag.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clear tag filter: Negation', exact: true })).toBeVisible();
  await page.goto(`${LIST}?tag=not-a-tag`);
  await expect(page).toHaveURL(/#\/study\/grammar$/);
  await expect(page.getByRole('link', { name: /Clear tag filter/ })).toHaveCount(0);
});

test('unknown and unpublished ids use the topic-specific not-found view', async ({ page }) => {
  await mockPack(page);
  for (const id of ['unknown', 'unpublished']) {
    await page.goto(`${LIST}/${id}`);
    await expect(page.getByRole('heading', { name: 'This page is not here', exact: true })).toBeVisible();
    await expect(
      page.getByText('This grammar topic is not published or does not exist.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Topics', exact: true })).toHaveAttribute(
      'href',
      '#/study/grammar',
    );
  }
});

test('a service 500 displays its real reason once without a retry loop', async ({ page }) => {
  let requests = 0;
  await page.route(TOPICS_REQUEST, (route) => {
    requests++;
    return route.fulfill({ status: 500, json: { error: 'unavailable' } });
  });
  await page.goto(LIST);
  await expect(page.getByRole('alert')).toHaveText('Could not load topics: HTTP 500: unavailable');
  await page.waitForTimeout(300);
  expect(requests).toBe(1);
  await noPageOverflow(page);
});

for (const destination of ['', '/test-only']) {
  test(`loading ${destination ? 'the reader' : 'the list'} keeps the page and section control still @phone`, async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(TOPICS_REQUEST, async (route) => {
      await held;
      const topics = testPack().topics;
      await route.fulfill({
        json: destination
          ? topics[0]
          : topics.map(({ id, chapter, level, tags, title }) => ({ id, chapter, level, tags, title })),
      });
    });
    await page.goto(`${LIST}${destination}`);
    await expect(page.getByRole('status')).toHaveText('Loading topics…');
    await settled(page);
    const before = await layout(page, '[role="radiogroup"]');
    const region = await page.locator('[data-grammar-topics]').boundingBox();
    release();
    await expect(page.getByRole('heading', { name: destination ? 'TEST TOPIC' : 'Topics', exact: true })).toBeVisible();
    expect(await layout(page, '[role="radiogroup"]')).toEqual(before);
    expect(await page.locator('[data-grammar-topics]').boundingBox()).toEqual(region);
    await noPageOverflow(page);
  });
}

for (const theme of ['light', 'sepia', 'dark']) {
  test(`list, section switch, reader and table work at 360px in ${theme} @phone`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('relire_theme', value), theme);
    await mockPack(page);
    await page.goto(LIST);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByRole('radio', { name: 'Conjugation', exact: true }).click();
    await expect(page).toHaveURL(/#\/study\/grammar\/conjugation$/);
    await page.getByRole('textbox', { name: 'Verb in the infinitive', exact: true }).fill('aller');
    await page.getByRole('button', { name: 'Conjugate', exact: true }).click();
    await expect(page.getByRole('article', { name: 'aller', exact: true })).toBeVisible();
    await noPageOverflow(page);
    await page.getByRole('radio', { name: 'Topics', exact: true }).click();
    await expect(page).toHaveURL(/#\/study\/grammar$/);
    await page.getByRole('link', { name: /TEST TOPIC A1/ }).click();
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    const scroll = page.locator('[data-slot="table-container"]');
    expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await scroll.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await noPageOverflow(page);
    await page.getByRole('link', { name: 'Back to Topics', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  });
}

for (const destination of ['', '/test-only']) {
  test(`offline fallback retains ${destination ? 'one topic' : 'the summary list'} after a successful load`, async ({
    page,
  }) => {
    await mockPack(page);
    await page.goto(`${LIST}${destination}`);
    const content = destination
      ? page.getByRole('heading', { name: 'TEST TOPIC', exact: true })
      : page.getByRole('link', { name: /TEST TOPIC A1/ });
    await expect(content).toBeVisible();
    let requests = 0;
    await page.route(TOPICS_REQUEST, (route) => {
      requests++;
      return route.abort('failed');
    });
    await page.reload();
    await expect(content).toBeVisible();
    expect(requests).toBe(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('a topic 500 is a real load error, not a not-found or stale success', async ({ page }) => {
  await mockPack(page);
  await page.goto(`${LIST}/test-only`);
  await expect(page.getByRole('article')).toBeVisible();
  await page.route(TOPICS_REQUEST, (route) => route.fulfill({ status: 500, json: { error: 'unavailable' } }));
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText('Could not load topics: HTTP 500: unavailable');
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('Chinese UI selects Chinese prose but keeps French cells and examples @phone', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('relire_lang', 'zh'));
  await mockPack(page);
  await page.goto(`${LIST}/test-only`);
  const article = page.getByRole('article');
  await expect(article).toHaveAttribute('lang', 'zh');
  await expect(article.getByRole('heading').first()).toHaveText(topicFixture().title.zh);
  await expect(article.getByText('TEST PARAGRAPH', { exact: true })).toHaveCount(0);
  await expect(article.locator('li [lang="fr"]').first()).toHaveText('TEST');
  await expect(page.getByRole('radiogroup', { name: zh.grammarTopics.sections, exact: true })).toBeVisible();
  await noPageOverflow(page);
});
