/** Fake content origin only; all topic text comes from the TEST fixture, never a live service. */
import type { Page } from '@playwright/test';
import type { GrammarTopicsPack } from '../src/types/grammarTopic';
import type { GrammarTagIndex } from '../src/types/grammarTagIndex';
import { topicsFixture } from '../tests/fixtures/grammarTopics';

export const CONTENT_ORIGIN = 'http://content.test';
export const TOPICS_REQUEST = `${CONTENT_ORIGIN}/v1/topics**`;
export const INDEX_REQUEST = `${CONTENT_ORIGIN}/v1/tag-index`;
export const emptyTopics = (): GrammarTopicsPack => ({ ...topicsFixture(), topics: [] });

export async function mockTopics(page: Page, pack = emptyTopics()) {
  await page.route(TOPICS_REQUEST, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/topics') {
      return route.fulfill({
        json: pack.topics.map(({ id, chapter, level, tags, title }) => ({ id, chapter, level, tags, title })),
      });
    }
    const topic = pack.topics.find((entry) => path === `/v1/topics/${entry.id}`);
    return route.fulfill({ status: topic ? 200 : 404, json: topic ?? { error: 'not-found' } });
  });
}

export async function mockIndex(page: Page, index: GrammarTagIndex = {}) {
  await page.route(INDEX_REQUEST, (route) => route.fulfill({ json: index }));
}
