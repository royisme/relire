/** TEST-only topic setup and workbench locators; rejects provider/lookup requests instead of mocking answers. */
import type { Page } from '@playwright/test';
import { mockTopics, CONTENT_ORIGIN } from './contentService.helpers';
import { learningFixture, secondLearningFixture, referenceOnlyFixture } from '../tests/fixtures/grammarLearning';
import { topicsFixture } from '../tests/fixtures/grammarTopics';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import zh from '../src/i18n/locales/zh.json' with { type: 'json' };

export const TOPIC = '/#/study/grammar/test-only';
export async function setup(page: Page, language: 'en' | 'zh' = 'en', theme = 'light') {
  await page.addInitScript(
    ({ language, theme }) => {
      localStorage.setItem('relire_onboarded', '1');
      localStorage.setItem('relire_lang', language);
      localStorage.setItem('relire_theme', theme);
    },
    { language, theme },
  );
  const topic = learningFixture();
  topic.blocks.push({ type: 'note', text: { ...topic.title, en: 'TEST full reference' } });
  const secondTopic = secondLearningFixture();
  const referenceTopic = referenceOnlyFixture();
  const pack = { ...topicsFixture(), topics: [topic, secondTopic, referenceTopic] };
  await mockTopics(page, pack);
  const forbidden: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === 'GET' &&
      url.origin === CONTENT_ORIGIN &&
      ['/v1/topics', '/v1/tag-index', ...pack.topics.map((entry) => `/v1/topics/${entry.id}`)].includes(url.pathname)
    )
      return route.fallback();
    if (request.method() === 'GET' && url.origin === 'http://localhost:5174' && !url.pathname.startsWith('/v1/'))
      return route.fallback();
    if (request.method() === 'GET' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname))
      return route.fulfill({ contentType: 'text/css', body: '' });
    forbidden.push(`${request.method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  return { topic, secondTopic, referenceTopic, forbidden };
}

export const workbench = (page: Page) => page.locator('[data-topic-workbench]');
export const index = (page: Page, language: 'en' | 'zh' = 'en') =>
  workbench(page).getByRole('group', {
    name: (language === 'en' ? en : zh).grammarTopics.learning.index.label,
    exact: true,
  });
export const geometry = (page: Page) =>
  page
    .locator('#topic-instruction, [aria-labelledby="topic-instruction"], [data-topic-actions], [data-topic-result]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top + scrollY, left: rect.left, height: rect.height, width: rect.width };
      }),
    );
