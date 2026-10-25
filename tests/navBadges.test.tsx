/** Badge ownership: the due count sits on the Words row, the unresolved count on Mistakes, and never on a parent row. */
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

const render = (rail: boolean, dueCount = 3, route: Route = { name: 'mistakes' }, resolved = [false, false, true]) => {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, getSnapshot, getServerSnapshot) =>
    useStore(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot),
  );
  // Three cards are due while two mistakes remain unresolved: two real metrics, never one combined number.
  // A spy on the actual export restores itself; a module mock would leak into the other test files.
  const mistakes = spyOn(mistakesHook, 'useMistakes').mockImplementation((() => ({
    loading: false,
    rows: resolved.map((resolved) => ({ resolved })),
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

test('the Mistakes label stays unchanged in English and Chinese', () => {
  expect(en.study.mistakes).toBe('Mistakes');
  expect(zh.study.mistakes).toBe('错题本');
});

test('Recordings exists as a label in both locales and the My study strings are gone', () => {
  expect(en.nav.recordings).toBe('Recordings');
  expect(zh.nav.recordings).toBe('跟读录音');
  expect(en.learning.shadowingContext).toContain('Speaking → Recordings');
  expect(zh.learning.shadowingContext).toContain('口语 → 跟读录音');
  for (const locale of [en, zh]) {
    expect(locale.nav).not.toHaveProperty('vocab');
    expect(locale.study).not.toHaveProperty('label');
    expect(locale.study).not.toHaveProperty('shadowing');
    expect(JSON.stringify(locale)).not.toContain('My study');
    expect(JSON.stringify(locale)).not.toContain('我的学习');
  }
});

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

test('the due badge belongs to the Words row and the unresolved count to Mistakes, never to a parent', () => {
  const html = render(false);
  const words = row(html, 'Words');
  expect(words).toContain('>3<');
  expect(words).toContain('3 due');
  expect(words).toContain('href="#/words"');
  expect(words).toContain('ml-auto');
  const mistakes = row(html, 'Mistakes');
  expect(mistakes).toContain('>2<');
  expect(mistakes).toContain('2 to review');
  expect(mistakes).toContain('href="#/mistakes"');
  expect(mistakes).toContain('ml-auto');
  // My study is gone: nothing sums the two metrics, and no parent row carries a count.
  expect(html).not.toContain('My study');
  expect(html).not.toContain('href="#/study');
  const study = render(false, 3, { name: 'recordings' });
  const between = study.slice(
    study.indexOf(row(study, 'Speaking')) + row(study, 'Speaking').length,
    study.indexOf(row(study, 'Mistakes')),
  );
  expect([...between.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
    '#/speaking/read-aloud',
    '#/speaking/recordings',
  ]);
  expect(row(study, 'Recordings')).not.toMatch(/tnum/);
  for (const tab of ['Grammar', 'Reading', 'Progress', 'Speaking']) expect(row(html, tab)).not.toMatch(/tnum/);
  expect(html).not.toContain('>5<');
});

test('the rail keeps Words and Mistakes counts on their own corners and shows no study child', () => {
  const html = render(true);
  const words = row(html, 'Words');
  expect(words).toContain('href="#/words"');
  expect(words).toContain('aria-label="Words, 3 due"');
  expect(words).toContain('>3<');
  expect(words).toContain('tnum');
  expect(words).toContain('absolute top-0 right-0');
  expect(words).not.toContain('>Words<');
  const mistakes = row(html, 'Mistakes');
  expect(mistakes).toContain('href="#/mistakes"');
  expect(mistakes).toContain('aria-label="Mistakes, 2 to review"');
  expect(mistakes).toContain('>2<');
  expect(mistakes).toContain('tnum');
  expect(mistakes).toContain('absolute top-0 right-0');
  expect(mistakes).not.toContain('>Mistakes<');
  expect(html).not.toContain('>5<');
  expect(html).not.toContain('My study');
  expect(html).not.toContain('href="#/study');
  // The rail never draws a child: Recordings is reachable only through the hub or the drawer.
  const speaking = row(html, 'Speaking');
  expect(speaking).toContain('href="#/speaking"');
  expect(speaking).not.toMatch(/tnum/);
  expect(html).not.toContain('href="#/speaking/recordings"');
  expect(html).not.toContain('title="Recordings"');
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
      expect(html).not.toContain('My study');
      expect(html).not.toContain('href="#/study');
    }
  });

  for (const language of ['en', 'zh']) {
    test(`${language}: Mistakes owns a top-level row immediately before Progress, with no children (${rail ? 'rail' : 'expanded/drawer'})`, async () => {
      await i18n.changeLanguage(language);
      try {
        for (const route of [{ name: 'mistakes' }, { name: 'words' }, { name: 'recordings' }] as const) {
          const html = render(rail, 3, route);
          const mistakes = row(html, i18n.t('study.mistakes'));
          const progress = row(html, i18n.t('nav.analytics'));
          const speaking = row(html, i18n.t('learning.speaking'));
          expect(mistakes).toContain('href="#/mistakes"');
          expect(mistakes).toContain('lucide-notebook-pen');
          expect(mistakes.includes('aria-current="page"')).toBe(route.name === 'mistakes');
          expect(html.indexOf(speaking)).toBeLessThan(html.indexOf(mistakes));
          expect(html.indexOf(mistakes)).toBeLessThan(html.indexOf(progress));
          // No link between these sibling rows: Mistakes never owns a child, even when current.
          expect(html.slice(html.indexOf(mistakes) + mistakes.length, html.indexOf(progress))).not.toContain('<a ');
          expect(html.match(/href="#\/mistakes"/g)).toHaveLength(1);
          expect(html).not.toContain('href="#/mistakes/');
          expect(html).not.toContain('href="#/study/mistakes');
          // Speaking lists Read aloud and Recordings when there is room; the rail never draws a child.
          const between = html.slice(html.indexOf(speaking) + speaking.length, html.indexOf(mistakes));
          expect([...between.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual(
            !rail && route.name === 'recordings' ? ['#/speaking/read-aloud', '#/speaking/recordings'] : [],
          );
          if (!rail && route.name === 'recordings') {
            expect(row(html, i18n.t('learning.readAloud'))).toContain('href="#/speaking/read-aloud"');
            expect(row(html, i18n.t('nav.recordings'))).toContain('href="#/speaking/recordings"');
            expect(row(html, i18n.t('nav.recordings'))).toContain('aria-current="page"');
            expect(speaking).toContain('aria-current="true"');
          }
          // The lower group's rule separates these rows from the skill destinations.
          expect(html.slice(html.indexOf(speaking) + speaking.length, html.indexOf(mistakes))).toContain('border-t');
          expect(mistakes).toContain('>2<');
          expect(mistakes).not.toContain('>3<'); // The third fixture row is resolved.
          expect(mistakes).toContain(i18n.t('nav.toReview', { count: 2 }));
          expect(mistakes).toContain(rail ? 'absolute top-0 right-0' : 'ml-auto');
          if (rail)
            expect(mistakes).toContain(
              `aria-label="${i18n.t('study.mistakes')}, ${i18n.t('nav.toReview', { count: 2 })}"`,
            );
          const words = row(html, i18n.t('nav.words'));
          expect(words).toContain('>3<');
          expect(words).not.toContain('>2<');
          expect(html.match(/class="tnum /g)).toHaveLength(2);
          expect(html).not.toContain('>5<');
          for (const label of [
            'nav.analytics',
            'learning.areas.reading',
            'learning.areas.grammar',
            'learning.speaking',
          ])
            expect(row(html, i18n.t(label))).not.toMatch(/tnum|sr-only/);
          expect(html).not.toContain('My study');
          expect(html).not.toContain('href="#/study');
        }
      } finally {
        await i18n.changeLanguage('en');
      }
    });
  }

  test(`zero unresolved shows no Mistakes badge, even with resolved rows and due Words (${rail ? 'rail' : 'expanded/drawer'})`, () => {
    for (const resolved of [[], [true, true]]) {
      const html = render(rail, 3, { name: 'mistakes' }, resolved);
      const mistakes = row(html, 'Mistakes');
      expect(mistakes).not.toMatch(/tnum|sr-only/);
      expect(mistakes).not.toContain('to review');
      expect(mistakes).not.toContain('>0<');
      expect(row(html, 'Words')).toContain('>3<');
      expect(html).not.toContain('My study');
    }
  });

  test(`zero due shows no Words badge, without borrowing unresolved mistakes (${rail ? 'rail' : 'expanded/drawer'})`, () => {
    const html = render(rail, 0);
    const words = row(html, 'Words');
    expect(words).not.toMatch(/tnum|sr-only/);
    expect(words).not.toContain('due');
    expect(words).not.toContain('>0<');
    expect(row(html, 'Mistakes')).toContain('>2<');
    expect(row(html, 'Mistakes')).toContain('2 to review');
  });
}
