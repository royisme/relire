/** Fake content origin only; all topic text comes from the TEST fixture, never a live service. */
import type { Page } from '@playwright/test';
import type { GrammarTopicsPack } from '../src/types/grammarTopic';
import type { GrammarTagIndex } from '../src/types/grammarTagIndex';
import { topicsFixture } from '../tests/fixtures/grammarTopics';
import { testBook } from '../tests/fixtures/vocabulary';
import { vocabularyPages } from '../scripts/vocabulary/publication';

export const CONTENT_ORIGIN = 'http://content.test';
export const TOPICS_REQUEST = `${CONTENT_ORIGIN}/v1/topics**`;
export const INDEX_REQUEST = `${CONTENT_ORIGIN}/v1/tag-index`;
export const emptyTopics = (): GrammarTopicsPack => ({ ...topicsFixture(), topics: [] });

export async function mockTopics(page: Page, pack = emptyTopics()) {
  await page.route(TOPICS_REQUEST, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/topics') {
      return route.fulfill({
        json: pack.topics.map(({ id, chapter, level, tags, title }, i) => ({
          id,
          chapter,
          level,
          tags,
          title,
          position: i + 1,
        })),
      });
    }
    const topic = pack.topics.find((entry) => path === `/v1/topics/${entry.id}`);
    return route.fulfill({ status: topic ? 200 : 404, json: topic ?? { error: 'not-found' } });
  });
}

export async function mockIndex(page: Page, index: GrammarTagIndex = {}) {
  await page.route(INDEX_REQUEST, (route) => route.fulfill({ json: index }));
}

export const VOCABULARY_REQUEST = `${CONTENT_ORIGIN}/v1/vocabulary/tcf-7000?**`;

/** A complete invented book keeps unrelated Words cross-links isolated without HTTP/DNS console noise. */
export async function mockVocabulary(page: Page) {
  const book = await testBook();
  const pages = vocabularyPages(book);
  await page.route(VOCABULARY_REQUEST, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const version = query.get('version');
    if (version && version !== book.manifest.version)
      return route.fulfill({ status: 410, json: { error: 'version-unavailable' } });
    const body = pages[Number(query.get('page'))];
    return route.fulfill({ status: body ? 200 : 404, json: body ?? { error: 'page-not-found' } });
  });
}
