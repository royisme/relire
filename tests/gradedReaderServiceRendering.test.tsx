/** Supplemental service states preserve starters and bound status space; SSR only, not visual acceptance. */
import { afterAll, expect, spyOn, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import '../src/i18n';
import { readerTestWindow } from './fixtures/readerTestWindow';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerSummary } from '../src/services/gradedReaders/catalogue';
import type { ReaderCatalogueState } from '../src/hooks/useReaderCatalogue';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import * as editionHook from '../src/hooks/useReaderEdition';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const { GradedReadersList } = await import('../src/components/graded/GradedReadersPage');
const { GradedReaderPage } = await import('../src/components/graded/GradedReaderPage');
afterAll(restoreWindow);
const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const reader = publishedReaderFixture();
const remote = { ...(await readerSummary(reader)), id: 'test-remote', order: 2 };
const noop = () => undefined;
const render = (state: ReaderCatalogueState) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <GradedReadersList
        content={{ status: 'ready', readers: [reader], retry: noop }}
        progress={{ rows: [], retry: noop }}
        service={{ ...state, retry: noop }}
      />
    </I18nextProvider>,
  );
for (const language of ['en', 'zh']) {
  test(`${language}: catalogue loading/ready/empty/saved/error keep local titles and a bounded status slot`, async () => {
    await i18n.changeLanguage(language);
    const states: [ReaderCatalogueState, string][] = [
      [{ status: 'loading' }, 'gradedReader.service.loading'],
      [{ status: 'ready', readers: [remote] }, 'gradedReader.service.ready'],
      [{ status: 'ready', readers: [] }, 'gradedReader.service.empty'],
      [{ status: 'ready', readers: [remote], saved: true }, 'gradedReader.service.savedCatalogue'],
      [{ status: 'error', error: 'TEST offline without saved list' }, 'common.retry'],
      [{ status: 'error', error: 'TEST HTTP 503' }, 'common.retry'],
      [{ status: 'error', error: 'TEST schema and hash rejected' }, 'common.retry'],
    ];
    for (const [state, label] of states) {
      const html = render(state);
      expect(html).toContain('href="#/read/graded/test-book"');
      expect(html).toContain('h-28 overflow-auto');
      expect(html).toContain(i18n.t(label));
      if (state.error) expect(html).toContain(state.error);
      expect(html.includes('test-remote?version=')).toBe(state.status === 'ready' && Boolean(state.readers?.length));
    }
    const html = render({ status: 'ready', readers: [remote], conflicts: [await readerSummary(reader)] });
    expect(html).toContain(i18n.t('gradedReader.service.keepOffline'));
    expect(html).toContain(i18n.t('gradedReader.service.conflict', { ids: reader.body.id }));
    expect(html).not.toContain(reader.body.sentences[0].fr);
  });
  test(`${language}: unavailable remote route has loading, Back/Retry then actual error or not-found, never prose`, async () => {
    await i18n.changeLanguage(language);
    const hook = spyOn(editionHook, 'useReaderEdition');
    try {
      for (const state of [{}, { missing: true }, { error: 'TEST HTTP 410: version-unavailable' }]) {
        hook.mockReturnValue({ ...state, retry: noop });
        const html = renderToStaticMarkup(
          <I18nextProvider i18n={i18n}>
            <GradedReaderPage
              readerId="test-unavailable"
              vocabulary={{ rows: [] } as unknown as VocabularyModel}
              onOpenShadowingLog={noop}
            />
          </I18nextProvider>,
        );
        expect(html).toContain(i18n.t('gradedReader.back'));
        expect(html).toContain('h-40 overflow-auto');
        expect(html).not.toContain(reader.body.sentences[0].fr);
        if ('error' in state) expect(html).toContain(state.error!);
        if ('missing' in state) expect(html).toContain(i18n.t('notFound.gradedReader'));
        if ('error' in state || 'missing' in state) expect(html).toContain(i18n.t('common.retry'));
        else expect(html).toContain('aria-busy="true"');
      }
    } finally {
      hook.mockRestore();
    }
  });
}
