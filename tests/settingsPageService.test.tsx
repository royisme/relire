/**
 * SettingsPage's own draft and commit path around Settings → Content service: an unsaved draft elsewhere
 * survives a service save, Words opened after that save reads the new service state, and turning the switch
 * on without pressing Save stores nothing. No browser: the page runs through the repo's DOM-free hook probe,
 * so the section components are elements and their edits and saves go through the props the page really passes.
 */
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { getAppSettings, type AppSettings } from '../src/utils/appSettings';
import { saveSlice } from '../src/components/settings/slices';
import { PracticeSection } from '../src/components/settings/PracticeSection';
import { ServiceSection } from '../src/components/settings/ServiceSection';
import { WordsSection } from '../src/components/settings/WordsSection';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { useVocabularyBook } from '../src/hooks/useVocabularyBook';
import { contentServiceUrl } from '../src/services/grammarTopics/service';
import type { SettingsSection } from '../src/utils/routes';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';
import en from '../src/i18n/locales/en.json';

const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  initAsync: false,
  interpolation: { escapeValue: false },
});
// A dynamic namespace because the spy replaces the hook in place: testable, unlike a module mock that would leak.
const translations = await import('react-i18next');

// The page needs the hash router's window, and a wide layout: the narrow one resolves to the section list.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    location: { hash: '' },
    relireHistory: { read: () => 0, replace: () => undefined, push: () => undefined },
  }),
});
const { SettingsPage } = await import('../src/components/settings/SettingsPage');
afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

const vocabulary = { rows: [] } as unknown as VocabularyModel;
const service = { enabled: true, url: 'http://content.test', key: 'TEST-key' };
let probe: ReturnType<typeof readerHookProbe>;
let translation: ReturnType<typeof spyOn<typeof translations, 'useTranslation'>>;
let appSaves: AppSettings[];
beforeEach(() => {
  freshSettingsStorage();
  appSaves = [];
  probe = readerHookProbe();
  translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: i18n.t } as never);
});
afterEach(() => {
  translation.mockRestore();
  probe.restore();
  restoreSettingsStorage();
});

/** The live page tree for a section; the probe keeps the page's state between renders. */
const renderPage = (section: SettingsSection) =>
  probe.render(() =>
    SettingsPage({
      section,
      purpose: 'text',
      sectionsInSidebar: false,
      vocabulary,
      keyRequest: null,
      onSettingsSaved: (next) => {
        appSaves.push(next);
      },
      onReturn: () => undefined,
    }),
  );

/** The props the page passes a section of the tree, which is where the real callbacks live. */
function propsOf<T>(tree: ReactElement, component: (props: T) => unknown): T {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (node: ReactNode) => {
    if (!isValidElement<Record<string, unknown>>(node)) return;
    found.push(node);
    Children.forEach(node.props.children as ReactNode, visit);
  };
  visit(tree);
  const match = found.find((node) => node.type === component);
  if (!match) throw new Error('expected element not found');
  return match.props as T;
}

test('a service save leaves an unsaved draft in another section alone', () => {
  // An unsaved Practice edit, made in the page's draft while its own section is open.
  const practice = propsOf(renderPage('practice'), PracticeSection);
  const unsavedPractice = !practice.draft.practiceStrictAccents;
  practice.onChange({ ...practice.draft, practiceStrictAccents: unsavedPractice });
  // The service fields hold their own draft; the section's Save submits it through the page's commit callback.
  const edited = propsOf(renderPage('service'), ServiceSection);
  edited.onChange({ ...edited.draft, contentService: service });
  const saving = propsOf(renderPage('service'), ServiceSection);
  saving.onSaved(saveSlice(saving.draft, 'service'));
  // Stored: the service slice alone, and the app was told once.
  expect(getAppSettings().contentService).toEqual(service);
  expect(getAppSettings().practiceStrictAccents).not.toBe(unsavedPractice);
  expect(appSaves.at(-1)?.contentService).toEqual(service);
  // The page keeps the unsaved Practice edit beside the stored service block.
  const after = propsOf(renderPage('practice'), PracticeSection);
  expect(after.draft.practiceStrictAccents).toBe(unsavedPractice);
  expect(after.draft.contentService).toEqual(service);
  expect(after.saved.practiceStrictAccents).not.toBe(unsavedPractice);
});

test('after a service save, opening Words reads the new service state', () => {
  const edited = propsOf(renderPage('service'), ServiceSection);
  edited.onChange({ ...edited.draft, contentService: service });
  const saving = propsOf(renderPage('service'), ServiceSection);
  saving.onSaved(saveSlice(saving.draft, 'service'));
  expect(getAppSettings().contentService).toEqual(service);
  // Opening Words mounts the Words section against the page's committed state.
  expect(propsOf(renderPage('words'), WordsSection).model).toBe(vocabulary);
  // The words consumer is a mount of its own, so the probe goes and its hooks run for real.
  probe.restore();
  const configured = () => renderToStaticMarkup(createElement((): string => String(useVocabularyBook().configured)));
  expect(configured()).toBe('true');
  expect(contentServiceUrl()).toBe('http://content.test');
});

test('turning the switch on without pressing Save stores nothing', () => {
  const draft = propsOf(renderPage('service'), ServiceSection);
  draft.onChange({ ...draft.draft, contentService: { ...draft.draft.contentService, enabled: true } });
  // The page draft shows the switch on, and neither the store nor the app has it.
  expect(propsOf(renderPage('service'), ServiceSection).draft.contentService.enabled).toBe(true);
  expect(getAppSettings().contentService.enabled).toBe(false);
  expect(appSaves).toEqual([]);
});
