/** The reader header's short source label: three honest kinds, translated; articles and passages keep their own. */
import { afterAll, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { readerTestWindow } from './fixtures/readerTestWindow';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { gradedDocument, passageDocument, reviewSourceKey, type ReaderDocument } from '../src/types/readerSource';
import type { ExerciseUnit } from '../src/types/exercises';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
// `src/i18n` reads the saved interface language at import time; this test needs no real storage.
const stored = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, v: string) => stored.set(key, v) },
});
const { ReaderView } = await import('../src/components/ReaderView');
// The reader subscribes to speech state; this test only reads the header markup.
const store = spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, snapshot, server) =>
  (server ?? snapshot)(),
);
afterAll(() => {
  store.mockRestore();
  restoreWindow();
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const reader = publishedReaderFixture();
const noop = () => undefined;

const article = {
  id: 'test-article',
  title: 'TEST article title',
  level: 'A2',
  category: 'TEST category',
  source: 'TEST article source',
  content: 'TEST article sentence one.\nTEST article sentence two.',
  createdAt: '2026-10-23',
};

/** A labelled TEST passage unit, not real exercise content. */
const unit = {
  id: 'test-unit',
  title: 'TEST passage unit',
  level: 'A1',
  learningArea: 'grammar',
  type: 'FILL_BLANKS',
  items: [],
  readingPassage: { content: 'TEST passage sentence one.\nTEST passage sentence two.' },
} as unknown as ExerciseUnit;

const header = (document: ReaderDocument) => {
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ReaderView
        readingDocument={document}
        source={{ kind: 'article', articleId: article.id }}
        onBack={noop}
        onMissingKey={noop}
        onOpenShadowingLog={noop}
        activeWord={null}
        activeSentence={null}
      />
    </I18nextProvider>,
  );
  const match = html.match(/<p class="text-xs text-ink-500 font-sans mb-2">(.*?)<\/p>/);
  if (!match) throw new Error('TEST header line not found');
  return match[1];
};

test('a review record maps to one of three label kinds, never to its own text', () => {
  expect(reviewSourceKey('AI review: TEST author; TEST reviewer; not human review')).toBe('gradedReader.sourceAi');
  expect(reviewSourceKey('Human review: TEST reviewer')).toBe('gradedReader.sourceHuman');
  expect(reviewSourceKey('TEST ONLY synthetic reviewer')).toBe('gradedReader.sourceUnknown');
  expect(reviewSourceKey('')).toBe('gradedReader.sourceUnknown');
});

for (const language of ['en', 'zh'] as const) {
  test(`${language}: the header shows the short translated label for each review kind`, async () => {
    await i18n.changeLanguage(language);
    const t = i18n.t.bind(i18n);
    for (const [reviewedBy, key] of [
      ['AI review: TEST author; TEST reviewer; not human or teacher review', 'gradedReader.sourceAi'],
      ['Human review: TEST reviewer', 'gradedReader.sourceHuman'],
      ['TEST ONLY synthetic reviewer', 'gradedReader.sourceUnknown'],
    ] as const) {
      const document = gradedDocument({ ...reader, review: { ...reader.review, reviewedBy } }, t);
      expect(document.source).toBe(i18n.t(key));
      expect(header(document)).toContain(i18n.t(key));
      expect(header(document)).not.toContain(reviewedBy);
    }
    await i18n.changeLanguage('en');
  });
}

test('article and passage headers keep their own source text', () => {
  expect(header(article)).toBe(`${i18n.t('levels.A2')} · TEST category · TEST article source`);
  const passage = passageDocument(unit, 'TEST batch label');
  if (!passage) throw new Error('TEST passage document missing');
  expect(header(passage)).toBe(`${i18n.t('levels.A1')} · TEST passage unit · TEST batch label`);
});
