/** P1b acceptance: the Overview pace estimate shows beside Review/Learn only, only with at least 30 real gaps; static render, no browser. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { VocabularyBook, VocabularyRow } from '../src/types/vocabulary';
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
const tomorrow = new Date(2026, 9, 26, 15).getTime();
const sessionStart = now - 3 * 60 * 60_000;
const sessionTimes = (gaps: number[]): number[] => {
  const times = [sessionStart];
  for (const gap of gaps) times.push(times[times.length - 1] + gap);
  return times;
};
const uniform = (count: number, step: number) => Array.from({ length: count }, () => step);
/** A scheduled row whose history is one session with the given gaps, ending over an hour before now. */
const historyRow = (word: string, gaps: number[], dueAt: number): VocabularyRow => ({
  ...testRow(word),
  schedule: testMatureSchedule(dueAt),
  history: sessionTimes(gaps).map((reviewedAt, index) => ({
    operationId: `pace-${word}-${index}`,
    reviewedAt,
    outcome: 'remembered' as const,
    retentionPercent: 90,
    prior: testMatureSchedule(reviewedAt),
    next: testMatureSchedule(reviewedAt),
    revision: index + 1,
  })),
});
// Eight gaps of 30 s then 22 of 60 s: sorted, the 8th is 30 s and the 23rd 60 s, so p25 = 30 s and
// p75 = 60 s; 4 due cards give round(4 x 30 s) = 2 to round(4 x 60 s) = 4 minutes.
const rangeGaps = [...uniform(8, 30_000), ...uniform(22, 60_000)];
// Thirty gaps of 45 s: every percentile 45 s; 2 new cards give round(2 x 45 s) = 2 minutes on both ends.
const singleGaps = uniform(30, 45_000);
const dueBeside = (gaps: number[]): VocabularyRow[] => [
  historyRow('test-pace-due', gaps, now),
  ...['test-pace-due-1', 'test-pace-due-2', 'test-pace-due-3'].map((word) => ({
    ...testRow(word),
    schedule: testMatureSchedule(now),
  })),
];
const model = (rows: VocabularyRow[], ready = true): VocabularyModel => ({
  rows,
  now,
  epoch: 0,
  ready,
  error: null,
  preferences: { newPerDay: 20, retentionPercent: 90, studyBook: 'builtin' },
  day: { date: '2026-10-25', introducedKeys: [] },
  refresh: async () => {},
  savePreferences: async () => {},
});
const book = await testBook(2);
const states: {
  name: string;
  model: VocabularyModel;
  book?: VocabularyBook;
  pending?: boolean;
  failed?: boolean;
  /** Filled action controls expected: 1 in Review/Learn states, 0 in every other. */
  filled: 0 | 1;
  estimate?: { en: string; zh: string };
}[] = [
  {
    name: 'range beside Review with 30 gaps',
    model: model(dueBeside(rangeGaps)),
    // The rows are built-in wordbook words, so the book that holds them must be loaded to be studied.
    book,
    filled: 1,
    estimate: {
      en: 'About 2\u20134 min at your usual pace',
      zh: '\u6309\u4f60\u5e73\u65f6\u7684\u901f\u5ea6\uff0c\u7ea6 2\u20134 \u5206\u949f',
    },
  },
  {
    name: '29 gaps beside Review is not enough',
    model: model(dueBeside(rangeGaps.slice(0, 29))),
    book,
    filled: 1,
  },
  {
    name: 'one number beside Learn when both ends match',
    model: model([historyRow('test-pace-future', singleGaps, tomorrow)]),
    book,
    filled: 1,
    estimate: {
      en: 'About 2 min at your usual pace',
      zh: '\u6309\u4f60\u5e73\u65f6\u7684\u901f\u5ea6\uff0c\u7ea6 2 \u5206\u949f',
    },
  },
  {
    name: 'a fresh learner gets Learn with no estimate',
    model: model([{ ...testRow('test-pace-fresh'), schedule: testMatureSchedule(tomorrow) }]),
    book,
    filled: 1,
  },
  {
    name: 'the next-due state has a full pace but zero cards',
    model: model([historyRow('test-pace-next', rangeGaps, tomorrow)]),
    filled: 0,
  },
  {
    name: 'the empty state has no estimate',
    model: model([testRow('test-pace-unscheduled')]),
    filled: 0,
  },
  {
    name: 'pending hides the estimate beside a full queue',
    model: model(dueBeside(rangeGaps)),
    pending: true,
    filled: 0,
  },
  {
    name: 'not ready hides the estimate beside a full queue',
    model: model(dueBeside(rangeGaps), false),
    filled: 0,
  },
  {
    name: 'wordbook failure hides the estimate beside a full queue',
    model: model(dueBeside(rangeGaps)),
    pending: true,
    failed: true,
    filled: 0,
  },
];

beforeEach(freshSettingsStorage);
afterEach(restoreSettingsStorage);

for (const language of ['en', 'zh'] as const) {
  test.each(states)(`${language}: $name`, async (state) => {
    await i18n.changeLanguage(language);
    const html = render(
      <VocabularyHome model={state.model} book={state.book} pending={state.pending ?? false} failed={state.failed} />,
    );
    const slot = html.match(/^<div\b[^>]*><div\b([^>]*)>([\s\S]*?)<\/div>/);
    expect(slot).not.toBeNull();
    expect(slot![1].match(/class="([^"]*)"/)?.[1].split(' ')).toContain('h-12');
    const content = slot![2];
    const controls = html.match(/<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>/g) ?? [];
    const filled = controls.filter((control) => /class="[^"]*\bbg-accent-700\b/.test(control));
    expect(filled.length).toBeLessThanOrEqual(1);
    expect(filled).toHaveLength(state.filled);
    expect(html.match(/href="#\/words\/review"/g) ?? []).toHaveLength(state.filled);
    const marker = language === 'en' ? 'at your usual pace' : '\u6309\u4f60\u5e73\u65f6\u7684\u901f\u5ea6';
    if (state.estimate) {
      expect(content).toContain(`<p class="text-sm text-ink-600">${state.estimate[language]}</p>`);
    } else {
      expect(html).not.toContain(marker);
    }
  });
}
