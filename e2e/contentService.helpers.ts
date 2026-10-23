/** Fake content origin only; all topic text comes from the TEST fixture, never a live service. */
import type { Page } from '@playwright/test';
import type { GrammarTopicsPack } from '../src/types/grammarTopic';
import type { GrammarTagIndex } from '../src/types/grammarTagIndex';
import type { LexiconFormResponse, LexiconLemmaResponse } from '../src/types/lexicon';
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

export const LEXICON_REQUEST = `${CONTENT_ORIGIN}/v1/lexicon/**`;

/** What the fake lexicon answers, changeable while a test runs; every path it does not know is the service's 404. */
export interface LexiconMock {
  forms: Record<string, LexiconFormResponse>;
  lemmas: Record<string, LexiconLemmaResponse>;
  /** `error` answers every request 500, `offline` aborts it like a lost connection. */
  mode: 'ok' | 'error' | 'offline';
  /** A promise held per request (its decoded path and how many times it was asked): the answer waits for it, so a test decides when the lexicon arrives. */
  hold?: (path: string, nth: number) => Promise<void> | undefined;
  /** The decoded paths asked so far. */
  paths: string[];
}

/** Fake lexicon routes with TEST data only (tests/fixtures/lexicon.ts); the base `page` fixture installs an empty one. */
export async function mockLexicon(page: Page, data: Partial<Pick<LexiconMock, 'forms' | 'lemmas'>> = {}) {
  const mock: LexiconMock = { forms: {}, lemmas: {}, ...data, mode: 'ok', paths: [] };
  await page.route(LEXICON_REQUEST, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    mock.paths.push(path);
    const nth = mock.paths.filter((asked) => asked === path).length;
    if (mock.mode === 'offline') return route.abort('failed');
    const form = path.startsWith('/v1/lexicon/form/');
    await mock.hold?.(path, nth);
    if (mock.mode === 'error') return route.fulfill({ status: 500, json: { error: 'unavailable' } });
    const found = form
      ? mock.forms[path.slice('/v1/lexicon/form/'.length)]
      : mock.lemmas[path.slice('/v1/lexicon/'.length)];
    return route.fulfill({ status: found ? 200 : 404, json: found ?? { error: 'not-found' } });
  });
  return mock;
}
