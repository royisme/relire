/** Badge ownership: the due count sits on the Words row, the unresolved count on Mistakes, and never on My study. */
import { afterAll, expect, spyOn, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { Route } from '../src/utils/routes';
import { vocabularyDue } from '../src/utils/srs';
import { testMatureSchedule } from './fixtures/vocabulary';

const React = await import('react');

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

const render = (rail: boolean, dueCount = 3, route: Route = { name: 'mistakes' }) => {
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
    return renderToString(
      <I18nextProvider i18n={i18n}>
        <NavTree route={route} dueCount={dueCount} rail={rail} />
      </I18nextProvider>,
    );
  } finally {
    store.mockRestore();
    mistakes.mockRestore();
  }
};

/** Expanded/drawer labels are visible; rail labels live in title, even when aria-label also names a count. */
const row = (html: string, label: string) => {
  const tags = [...html.matchAll(/<a [^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
  const found = tags.filter((tag) => tag.includes(`>${label}<`) || tag.includes(`title="${label}"`));
  expect(found).toHaveLength(1);
  return found[0];
};

test('the due metric excludes unintroduced new cards and future learning steps', () => {
  const now = new Date(2026, 9, 25, 12).getTime();
  const review = { ...testMatureSchedule(now), dueAt: now - 86_400_000 };
  expect(
    [
      review,
      { ...review, phase: 'learning' as const, dueAt: now - 1 },
      { ...review, phase: 'relearning' as const, dueAt: now },
      null,
      { ...review, phase: 'learning' as const, dueAt: now + 1 },
    ].map((schedule) => vocabularyDue(schedule, now)),
  ).toEqual([true, true, true, false, false]);
});

test('the due badge belongs to the Words row and the unresolved count to Mistakes, not to My study', () => {
  const html = render(false);
  const words = row(html, 'Words');
  expect(words).toContain('>3<');
  expect(words).toContain('3 due');
  expect(words).toContain('href="#/words"');
  expect(words).toContain('ml-auto');
  const mistakes = row(html, 'Mistakes');
  expect(mistakes).toContain('>2<');
  expect(mistakes).toContain('2 to review');
  // My study is only the parent: it shows no count of its own, so 3 and 2 are never added into one number.
  const parent = row(html, 'My study');
  expect(parent).not.toMatch(/tnum/);
  expect(parent).not.toContain('>5<');
  expect(parent).toContain('href="#/study/mistakes"');
  expect(parent).toContain('<svg');
  const children = html.slice(html.indexOf(parent) + parent.length, html.indexOf(row(html, 'Progress')));
  expect([...children.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
    '#/study/shadowing',
    '#/study/mistakes',
  ]);
  for (const tab of ['Shadowing', 'Grammar', 'Reading', 'Progress']) expect(row(html, tab)).not.toMatch(/tnum/);
  expect(html).not.toContain('>5<');
  expect(parent.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0]).not.toBe(words.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0]);
});

test('the rail keeps the Words due count on its corner, never on My study or a hidden child', () => {
  const html = render(true);
  const words = row(html, 'Words');
  expect(words).toContain('href="#/words"');
  expect(words).toContain('aria-label="Words, 3 due"');
  expect(words).toContain('>3<');
  expect(words).toContain('tnum');
  expect(words).toContain('absolute top-0 right-0');
  expect(words).not.toContain('>Words<');
  const myStudy = row(html, 'My study');
  expect(myStudy).toContain('aria-label="My study"');
  expect(myStudy).not.toMatch(/tnum/);
  expect(myStudy).not.toContain('>5<');
  expect(html).not.toContain('to review');
  expect(html).not.toContain('>5<');
  expect(html).not.toContain('href="#/study/shadowing"');
});

for (const rail of [false, true]) {
  test(`Words owns no sidebar children and stays between Reading and Grammar (${rail ? 'rail' : 'expanded/drawer'})`, () => {
    for (const name of ['words', 'wordsAll', 'wordsReview', 'wordsPlay', 'wordsMap'] as const) {
      const html = render(rail, 3, { name });
      const words = row(html, 'Words');
      expect(html.indexOf(row(html, 'Reading'))).toBeLessThan(html.indexOf(words));
      expect(html.indexOf(words)).toBeLessThan(html.indexOf(row(html, 'Grammar')));
      expect(words).toContain('aria-current="page"');
      expect(words).toContain('<svg');
      expect(html.match(/href="#\/words"/g)).toHaveLength(1);
      expect(html).not.toContain('href="#/words/');
      expect(html).not.toContain('href="#/study/words');
      expect(html).not.toContain('>Overview<');
      expect(html).not.toContain('>All words<');
      expect(html).not.toContain('>Map<');
      expect(words).toContain('>3<');
      expect(row(html, 'My study')).not.toMatch(/tnum/);
    }
  });

  test(`zero due shows no Words badge, without borrowing unresolved mistakes (${rail ? 'rail' : 'expanded/drawer'})`, () => {
    const html = render(rail, 0);
    const words = row(html, 'Words');
    expect(words).not.toMatch(/tnum|sr-only/);
    expect(words).not.toContain('due');
    expect(words).not.toContain('>0<');
    expect(row(html, 'My study')).not.toMatch(/tnum/);
    if (!rail) {
      expect(row(html, 'Mistakes')).toContain('>2<');
      expect(row(html, 'Mistakes')).toContain('2 to review');
    }
  });
}
