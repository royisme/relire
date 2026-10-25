/** P1 acceptance on real Overview markup and queue inputs; no browser or visual acceptance. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { VocabularyBook } from '../src/types/vocabulary';
import { wordsInput } from '../src/services/today/inputs';
import { initialVocabularySchedule } from '../src/utils/srs';
import { testBook, testMatureSchedule, testRow } from './fixtures/vocabulary';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';

// Link reads the hash on import; rendering installs no browser events.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { VocabularyHome } = await import('../src/components/vocabulary/VocabularyHome');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const now = new Date(2026, 9, 25, 12).getTime();
const tomorrow = new Date(2026, 9, 26, 12).getTime();
const model: VocabularyModel = {
  rows: [],
  now,
  epoch: 0,
  ready: true,
  error: null,
  preferences: { newPerDay: 20, retentionPercent: 90 },
  day: { date: '2026-10-25', introducedKeys: [] },
  refresh: async () => {},
  savePreferences: async () => {},
};
const book = await testBook(3);
const oneNew = await testBook(1);
const due = { ...testRow('test-due'), schedule: testMatureSchedule(now) };
const dueLearning = { ...testRow('test-due-learning'), schedule: initialVocabularySchedule(now) };
const future = { ...testRow('test-future'), schedule: testMatureSchedule(tomorrow) };
const futureLearning = {
  ...testRow('test-future-learning'),
  schedule: { ...initialVocabularySchedule(now), phase: 'learning' as const, dueAt: now + 60_000 },
};
const populated = { ...model, rows: [due, future] };
const states: {
  name: string;
  model: VocabularyModel;
  book?: VocabularyBook;
  loading?: boolean;
  action: 'review' | 'learn' | 'next' | 'empty' | null;
  count?: number;
  nextDue?: number;
}[] = [
  { name: 'loading beats due, new and next', model: populated, book, loading: true, action: null },
  { name: 'not ready beats due, new and next', model: { ...populated, ready: false }, book, action: null },
  { name: 'both loading flags with an empty queue', model: { ...model, ready: false }, loading: true, action: null },
  { name: 'one due beats new and next', model: populated, book, action: 'review', count: 1 },
  {
    name: 'plural due across phases',
    model: { ...model, rows: [due, dueLearning, future] },
    book,
    action: 'review',
    count: 2,
  },
  { name: 'one new beats next', model: { ...model, rows: [future] }, book: oneNew, action: 'learn', count: 1 },
  { name: 'plural new beats next', model: { ...model, rows: [future] }, book, action: 'learn', count: 3 },
  { name: 'review returns tomorrow', model: { ...model, rows: [future] }, action: 'next', nextDue: tomorrow },
  {
    name: 'earliest learning return beats later review',
    model: { ...model, rows: [future, futureLearning] },
    action: 'next',
    nextDue: now + 60_000,
  },
  { name: 'C0 with no book or rows', model, action: 'empty' },
  {
    name: 'C0 with an exhausted daily allowance',
    model: { ...model, preferences: { ...model.preferences, newPerDay: 0 } },
    book,
    action: 'empty',
  },
  { name: 'C0 with no scheduled or eligible words', model: { ...model, rows: [testRow()] }, action: 'empty' },
];

beforeEach(freshSettingsStorage);
afterEach(restoreSettingsStorage);

for (const language of ['en', 'zh'] as const) {
  test.each(states)(`${language}: $name`, async (state) => {
    await i18n.changeLanguage(language);
    const html = render(<VocabularyHome model={state.model} book={state.book} loading={state.loading ?? false} />);
    const slot = html.match(/^<div\b[^>]*><div\b([^>]*)>([\s\S]*?)<\/div>/);
    expect(slot).not.toBeNull();
    expect(slot![1].match(/class="([^"]*)"/)?.[1].split(' ')).toContain('h-12');
    const content = slot![2];
    const controls = html.match(/<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>/g) ?? [];
    const filled = controls.filter((control) => /class="[^"]*\bbg-accent-700\b/.test(control));
    expect(filled.length).toBeLessThanOrEqual(1);
    const play = controls.find((control) => control.includes('href="#/words/play"'));
    expect(play).toBeDefined();
    expect(play).toContain(render(<>{i18n.t('vocab.play')}</>));
    expect(play).toContain('border border-ink-300 bg-surface');
    expect(play).not.toContain('bg-accent-700');
    expect(html).not.toContain('href="#/words/map"');

    if (state.action === null) {
      expect(slot![1]).toContain('aria-busy="true"');
      expect(content).toBe('');
      expect(filled).toHaveLength(0);
      expect(html).not.toContain('href="#/words/review"');
      return;
    }
    expect(slot![1]).not.toContain('aria-busy="true"');
    const time =
      state.nextDue === undefined
        ? undefined
        : new Intl.DateTimeFormat(language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(state.nextDue);
    const expected = render(<>{i18n.t(`vocab.action.${state.action}`, { count: state.count, time })}</>);
    if (state.action === 'review' || state.action === 'learn') {
      expect(content.match(/<a\b/g)).toHaveLength(1);
      expect(content).toContain('href="#/words/review"');
      expect(content).toContain(`>${expected}</a>`);
      expect(content).not.toContain('<p');
      expect(filled).toHaveLength(1);
      expect(filled[0]).toBe(content);
      expect(html.match(/href="#\/words\/review"/g)).toHaveLength(1);
      return;
    }
    expect(content).toMatch(/^<p\b[^>]*>[^<]+<\/p>$/);
    expect(content).toContain(`>${expected}</p>`);
    expect(content).not.toContain('<a');
    expect(html).not.toContain('href="#/words/review"');
    expect(filled).toHaveLength(0);
  });

  test(`${language}: actual new words, not spare allowance, match Today alongside due words`, async () => {
    await i18n.changeLanguage(language);
    const rows = book.entries.slice(0, 2).map((entry, index) => ({
      ...testRow(entry.word),
      introducedAt: now,
      schedule: index === 0 ? initialVocabularySchedule(now) : testMatureSchedule(tomorrow),
    }));
    const current = { ...model, rows, day: { ...model.day, introducedKeys: rows.map((row) => row.key) } };
    const input = wordsInput(rows, book, current.day, 20, now);
    expect(input).toEqual({ due: 1, newAvailable: 1, nextDue: tomorrow, reviewsToday: 0 });
    const html = render(<VocabularyHome model={current} book={book} loading={false} />);
    const stats = [...html.matchAll(/<dt\b[^>]*>(.*?)<\/dt><dd\b[^>]*>(\d+)<\/dd>/g)];
    expect(stats.map((stat) => stat[1])).toEqual([
      i18n.t('vocab.due'),
      i18n.t('vocab.learning'),
      i18n.t('vocab.available'),
    ]);
    expect(stats.map((stat) => Number(stat[2]))).toEqual([input.due, 1, input.newAvailable]);
    expect(stats[2][2]).toBe('1');
    expect(stats[2][2]).not.toBe('18');
  });
}

test('both locales remove the superseded Overview action and allowance keys', () => {
  for (const locale of [en, zh]) {
    expect(locale.vocab).not.toHaveProperty('continue');
    expect(locale.vocab).not.toHaveProperty('remaining');
  }
});
