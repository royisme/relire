/** Badge ownership: the due count sits on the Words row, the unresolved count on Mistakes, and never on My study. */
import { afterAll, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

await import('../src/i18n');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
// The tree draws the install row, which reads matchMedia/userAgent while rendering.
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    location: { hash: '' },
    relireHistory: { read: () => 0 },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'test' },
  }),
});
const { NavTree } = await import('../src/components/shell/NavTree');
const mistakesHook = await import('../src/hooks/useMistakes');
afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});

const render = (rail: boolean) => {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, getSnapshot, getServerSnapshot) =>
    useStore(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot),
  );
  // Three cards are due while two mistakes remain unresolved: two real metrics, never one combined number.
  // A spy on the actual export restores itself; a module mock would leak into the other test files.
  const mistakes = spyOn(mistakesHook, 'useMistakes').mockImplementation((() => ({
    loading: false,
    rows: [{ resolved: false }, { resolved: false }, { resolved: true }],
    error: null,
    retry: () => {},
  })) as never);
  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <NavTree route={{ name: 'words' }} dueCount={3} rail={rail} />
      </I18nextProvider>,
    );
  } finally {
    store.mockRestore();
    mistakes.mockRestore();
  }
};

/** The one row with this visible label (the parent and its Words child share an address). */
const row = (html: string, label: string) => {
  const tags = [...html.matchAll(/<a [^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
  const found = tags.filter((tag) => tag.includes(`>${label}<`));
  expect(found).toHaveLength(1);
  return found[0];
};

test('the due badge belongs to the Words row and the unresolved count to Mistakes, not to My study', () => {
  const html = render(false);
  const words = row(html, 'Words');
  expect(words).toContain('>3<');
  expect(words).toContain('3 due');
  const mistakes = row(html, 'Mistakes');
  expect(mistakes).toContain('>2<');
  expect(mistakes).toContain('2 to review');
  // My study is only the parent: it shows no count of its own, so 3 and 2 are never added into one number.
  const parent = row(html, 'My study');
  expect(parent).not.toMatch(/tnum/);
  expect(parent).not.toContain('>5<');
  for (const tab of ['Shadowing', 'Grammar']) expect(row(html, tab)).not.toMatch(/tnum/);
});

test('the rail keeps one icon per area and shows no child count rather than a misleading one', () => {
  const html = render(true);
  const tags = [...html.matchAll(/<a [^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
  const myStudy = tags.filter((tag) => tag.includes('aria-label="My study"'));
  expect(myStudy).toHaveLength(1);
  expect(myStudy[0]).not.toMatch(/tnum/);
  expect(html).not.toContain('to review');
});
