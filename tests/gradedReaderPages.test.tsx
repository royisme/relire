/** Server-rendered starter-list states and exact view/route/occurrence contracts, using labelled TEST prose only. */
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { readerTestWindow } from './fixtures/readerTestWindow';
import { gradedDocument, readerIdentity } from '../src/types/readerSource';
import { readerOccurrence } from '../src/services/gradedReaders/occurrence';
import { loadStarterReaders, findStarterReader, resetStarterReadersForTests } from '../src/services/gradedReaders/load';
import { parseRoute, routeHref } from '../src/utils/routes';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import type { ReaderProgress } from '../src/types/readerProgress';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const { GradedReadersList, readerListStatus } = await import('../src/components/graded/GradedReadersPage');
const { ReaderEditionGate } = await import('../src/components/graded/GradedReaderPage');
const { GradedReaderWorkspace } = await import('../src/components/graded/GradedReaderWorkspace');
afterAll(restoreWindow);

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const reader = publishedReaderFixture();
const noop = () => undefined;
const content = { status: 'ready' as const, readers: [reader], retry: noop };
const row: ReaderProgress = {
  readerId: reader.body.id,
  version: reader.version,
  snapshot: reader,
  openedAt: 1,
  lastOpenedAt: 1,
  lastSentenceId: null,
  answers: {},
  completedAt: null,
  revision: 0,
};
const vocabulary = { rows: [] } as unknown as VocabularyModel;
const renderList = (pack = content, progress: { rows?: ReaderProgress[]; error?: string } = {}) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <GradedReadersList content={pack} progress={{ ...progress, retry: noop }} />
    </I18nextProvider>,
  );
beforeEach(resetStarterReadersForTests);
afterEach(resetStarterReadersForTests);

for (const language of ['en', 'zh']) {
  test(`${language}: list has real links, an ordered list, unavailable progress and honest review provenance`, async () => {
    await i18n.changeLanguage(language);
    const html = renderList(content, { error: 'TEST IDB read failure' });
    expect(html).toContain('<ol');
    expect(html).toContain('href="#/read/graded/test-book"');
    expect(html).toContain('Un livre');
    expect(html).toContain('TEST IDB read failure');
    expect(html).toContain(i18n.t('gradedReader.status.unavailable'));
    expect(html).not.toContain(i18n.t('gradedReader.status.notOpened'));
    expect(html).toContain(i18n.t('gradedReader.reviewNotice'));
    expect(html).toContain(i18n.t('common.retry'));
    expect(html).not.toContain('<table');
  });
  test(`${language}: loading is bounded and busy, errors retain the actual message and Retry; empty stays empty`, async () => {
    await i18n.changeLanguage(language);
    const draw = (state: Parameters<typeof GradedReadersList>[0]['content']) =>
      renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <GradedReadersList content={state} progress={{ retry: noop }} />
        </I18nextProvider>,
      );
    const loading = draw({ status: 'loading', retry: noop });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('min-h-40');
    expect(loading).not.toContain('Un livre');
    const failed = draw({ status: 'error', error: 'TEST chunk rejected', retry: noop });
    expect(failed).toContain('TEST chunk rejected');
    expect(failed).toContain(i18n.t('common.retry'));
    const empty = draw({ status: 'ready', readers: [], retry: noop });
    expect(empty).toContain(i18n.t('gradedReader.empty'));
    expect(empty).not.toContain('Un livre');
  });
}

test('committed workspace server-renders authored text, checkpoints and explicit completion in natural flow, without article/recording tools', async () => {
  await i18n.changeLanguage('en');
  const original = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    original(subscribe, snapshot, server ?? snapshot),
  );
  const draw = (completedAt: number | null) =>
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <GradedReaderWorkspace
          opened={{
            row: { ...row, completedAt },
            session: { readerId: row.readerId, version: row.version, epoch: 0, revision: 0 },
          }}
          vocabulary={vocabulary}
          reload={noop}
        />
      </I18nextProvider>,
    );
  try {
    const html = draw(null);
    expect(html).toContain('data-reader-word');
    expect(html).toContain('Un livre');
    expect(html).toContain(i18n.t('gradedReader.stageNumber', { number: 1 }));
    expect(html).toContain(i18n.t('gradedReader.deviceVoice'));
    expect(html).toContain(i18n.t('gradedReader.markRead'));
    expect(html.indexOf('reader-checkpoints')).toBeGreaterThan(html.indexOf('</article>'));
    expect(html).toContain('var(--dock-height');
    expect(html).toContain('h-32');
    expect(html).not.toContain('data-practice-entry');
    expect(html).not.toContain(i18n.t('reader.makeExercises'));
    expect(html).not.toContain('pronunciation-controls');
    expect(draw(1000)).toContain(i18n.t('gradedReader.markUnread'));
    expect(draw(1000)).not.toContain(i18n.t('gradedReader.markRead'));
  } finally {
    store.mockRestore();
  }
});

test('status distinguishes unavailable, not opened, opened, read and only completed older bodies of the same id', () => {
  expect(readerListStatus(reader).status).toBe('unavailable');
  expect(readerListStatus(reader, []).status).toBe('notOpened');
  expect(readerListStatus(reader, [row]).status).toBe('opened');
  expect(readerListStatus(reader, [{ ...row, completedAt: 2 }]).status).toBe('read');
  expect(readerListStatus(reader, [{ ...row, version: 'a'.repeat(64) }]).earlier).toBeUndefined();
  expect(
    readerListStatus(reader, [{ ...row, readerId: 'test-other', version: 'a'.repeat(64), completedAt: 2 }]).earlier,
  ).toBeUndefined();
  expect(readerListStatus(reader, [{ ...row, completedAt: 2 }]).earlier).toBeUndefined();
  const earlier = { ...row, version: 'a'.repeat(64), completedAt: 2 };
  expect(readerListStatus(reader, [earlier])).toEqual({ status: 'notOpened', earlier });
});

test('gradedDocument is a view adapter with no article identity or learner fields', () => {
  expect(gradedDocument(reader)).toEqual({
    title: reader.body.title.fr,
    content: reader.body.sentences.map((sentence) => sentence.fr).join('\n'),
    level: 'A1',
    category: '',
    source: reader.review.reviewedBy,
  });
  expect(readerIdentity({ kind: 'graded', readerId: reader.body.id, version: reader.version })).toContain(
    reader.version,
  );
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ReaderEditionGate reader={reader} vocabulary={vocabulary} />
    </I18nextProvider>,
  );
  expect(html).toContain('aria-busy="true"');
  expect(html).not.toContain(reader.body.sentences[0].fr);
});

test('known, unknown and pinned routes resolve exactly from the starter, never another reader', async () => {
  await loadStarterReaders({ schemaVersion: 1, syllabusVersion: '1.0.0', readers: [reader] });
  for (const version of [undefined, reader.version, 'a'.repeat(64)]) {
    const route = { name: 'gradedReader' as const, readerId: reader.body.id, version };
    const parsed = parseRoute(routeHref(route)).route;
    expect(parsed).toEqual(route);
    expect(findStarterReader(route.readerId, version)).toEqual(version === 'a'.repeat(64) ? undefined : reader);
  }
  expect(findStarterReader('test-missing')).toBeUndefined();
});

test('repeated spelling binds by sentence and ordinal; compound entries retain every bound part', () => {
  const modified = structuredClone(reader);
  const other = {
    ...modified.body.glossary[0],
    id: 'livre-other',
    sense: 'other',
    gloss: { en: 'TEST different meaning', zh: modified.body.glossary[0].gloss.zh },
  };
  modified.body.glossary.push(other);
  modified.body.sentences[1].tokens[1].entryIds = [other.id];
  expect(readerOccurrence(modified, 's1', 2, 'livre', 'en').entries[0].id).toBe('livre-object');
  expect(readerOccurrence(modified, 's2', 1, 'livre', 'en').entries[0].id).toBe('livre-other');
  expect(readerOccurrence(reader, 's1', 0, 'C’est', 'en').entries.map((entry) => entry.id)).toEqual([
    'ce-function',
    'etre-identity',
  ]);
  expect(() => readerOccurrence(reader, 'test-missing', 0, 'livre', 'en')).toThrow('Missing reader binding');
});
