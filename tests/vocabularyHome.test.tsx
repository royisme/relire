/** P1 acceptance on real Overview markup and queue inputs; no browser or visual acceptance. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { VocabularyBook } from '../src/types/vocabulary';
import { wordsInput } from '../src/services/today/inputs';
import { formatAvailableAt, initialVocabularySchedule } from '../src/utils/srs';
import { testBook, testMatureSchedule, testRow } from './fixtures/vocabulary';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';

// Link reads the hash on import; rendering installs no browser events.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { VocabularyHome } = await import('../src/components/vocabulary/VocabularyHome');
const { VocabularyReview } = await import('../src/components/vocabulary/VocabularyReview');
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
const tomorrowMidnight = new Date(2026, 9, 26).getTime();
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
const twoNew = await testBook(2);
const due = { ...testRow('test-due'), schedule: testMatureSchedule(now) };
const dueLearning = {
  ...testRow('test-due-learning'),
  schedule: { ...initialVocabularySchedule(now), phase: 'learning' as const },
};
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
  pending?: boolean;
  failed?: boolean;
  action: 'review' | 'learn' | 'next' | 'empty' | null;
  labels?: { en: string; zh: string };
  nextDue?: number;
  dateOnly?: boolean;
}[] = [
  { name: 'pending beats due, new and next', model: populated, book, pending: true, action: null },
  { name: 'not ready beats due, new and next', model: { ...populated, ready: false }, book, action: null },
  { name: 'both waiting flags with an empty queue', model: { ...model, ready: false }, pending: true, action: null },
  { name: 'wordbook failure is not loading', model, pending: true, failed: true, action: null },
  {
    name: 'one due beats new and next',
    model: populated,
    book,
    action: 'review',
    labels: { en: 'Review 1 word', zh: '\u590d\u4e60 1 \u4e2a\u8bcd' },
  },
  {
    name: 'plural due across phases',
    model: {
      ...model,
      rows: [
        due,
        dueLearning,
        { ...testRow('test-due-relearning'), schedule: { ...dueLearning.schedule, phase: 'relearning' } },
        future,
      ],
    },
    book,
    action: 'review',
    labels: { en: 'Review 3 words', zh: '\u590d\u4e60 3 \u4e2a\u8bcd' },
  },
  {
    name: 'one new beats next',
    model: { ...model, rows: [future] },
    book: oneNew,
    action: 'learn',
    labels: { en: 'Learn 1 new word', zh: '\u5b66\u4e60 1 \u4e2a\u65b0\u8bcd' },
  },
  {
    name: 'plural new beats next',
    model: { ...model, rows: [future] },
    book: twoNew,
    action: 'learn',
    labels: { en: 'Learn 2 new words', zh: '\u5b66\u4e60 2 \u4e2a\u65b0\u8bcd' },
  },
  {
    name: 'review returns tomorrow at midnight, displayed as date only',
    model: { ...model, rows: [future] },
    action: 'next',
    nextDue: tomorrowMidnight,
    dateOnly: true,
  },
  {
    name: 'earliest learning return beats later review',
    model: { ...model, rows: [future, futureLearning] },
    action: 'next',
    nextDue: now + 60_000,
  },
  {
    name: 'review midnight wins over a learning card due tomorrow at 10:00',
    model: {
      ...model,
      rows: [
        future,
        { ...futureLearning, schedule: { ...futureLearning.schedule, dueAt: new Date(2026, 9, 26, 10).getTime() } },
      ],
    },
    action: 'next',
    nextDue: tomorrowMidnight,
    dateOnly: true,
  },
  {
    name: 'learning exactly at midnight is also date only',
    model: {
      ...model,
      rows: [{ ...futureLearning, schedule: { ...futureLearning.schedule, dueAt: tomorrowMidnight } }],
    },
    action: 'next',
    nextDue: tomorrowMidnight,
    dateOnly: true,
  },
  {
    name: 'one millisecond after midnight includes a short time',
    model: {
      ...model,
      rows: [{ ...futureLearning, schedule: { ...futureLearning.schedule, dueAt: tomorrowMidnight + 1 } }],
    },
    action: 'next',
    nextDue: tomorrowMidnight + 1,
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
    const play = controls.find((control) => control.includes('href="#/words/play"'));
    expect(play).toBeDefined();
    expect(play).toContain(render(<>{i18n.t('vocab.play')}</>));
    expect(play).toContain('border border-ink-300 bg-surface');
    expect(play).not.toContain('bg-accent-700');
    expect(html).not.toContain('href="#/words/map"');

    if (state.action === null) {
      expect(slot![1].includes('aria-busy="true"')).toBe(!state.failed);
      expect(content).toBe('');
      const stats = [...html.matchAll(/<dt\b[^>]*>(.*?)<\/dt><dd\b[^>]*>(.*?)<\/dd>/g)];
      expect(stats.map((stat) => stat[1])).toEqual([
        i18n.t('vocab.due'),
        i18n.t('vocab.learning'),
        i18n.t('vocab.available'),
      ]);
      expect(stats.map((stat) => stat[2])).toEqual(['\u2013', '\u2013', '\u2013']);
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
            ...(state.dateOnly ? {} : { timeStyle: 'short' }),
          }).format(state.nextDue);
    const expected = render(
      <>
        {state.labels?.[language] ??
          (state.action === 'next'
            ? language === 'en'
              ? `Your next word returns on ${time}.`
              : `\u4e0b\u4e00\u4e2a\u8bcd\u5c06\u5728 ${time} \u56de\u6765\u590d\u4e60\u3002`
            : language === 'en'
              ? 'Nothing to study right now. Import a word list below, or save words while you read.'
              : '\u73b0\u5728\u6ca1\u6709\u8981\u5b66\u7684\u8bcd\u3002\u53ef\u4ee5\u5728\u4e0b\u65b9\u5bfc\u5165\u8bcd\u8868\uff0c\u6216\u5728\u9605\u8bfb\u65f6\u6536\u85cf\u751f\u8bcd\u3002')}
      </>,
    );
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
    if (state.action === 'next') {
      // The Overview and the shared formatter agree on the same nextDue, in this language.
      expect(state.nextDue).toBeDefined();
      expect(time).toBe(formatAvailableAt(state.nextDue!, language));
      expect(content).toContain(formatAvailableAt(state.nextDue!, language));
    }
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
    expect(input).toEqual({ due: 1, newAvailable: 1, nextDue: tomorrowMidnight, reviewsToday: 0 });
    const html = render(<VocabularyHome model={current} book={book} pending={false} />);
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

  test(`${language}: the Review page counter line agrees with the Overview action for the same data`, async () => {
    await i18n.changeLanguage(language);
    // newPerDay 20 with two of the book's three entries introduced today (both due tomorrow): one new word
    // is left, not the 18 spare allowance, and the Overview offers exactly that one word.
    const rows = book.entries.slice(0, 2).map((entry) => ({
      ...testRow(entry.word),
      introducedAt: now,
      schedule: testMatureSchedule(tomorrow),
    }));
    const current = { ...model, rows, day: { ...model.day, introducedKeys: rows.map((row) => row.key) } };
    expect(wordsInput(rows, book, current.day, 20, now)).toEqual({
      due: 0,
      newAvailable: 1,
      nextDue: tomorrowMidnight,
      reviewsToday: 0,
    });
    // The Review hook reads the live clock, so the same `now` drives its rendered line.
    const clock = spyOn(Date, 'now').mockReturnValue(now);
    let review: string;
    try {
      review = render(<VocabularyReview model={current} book={book} />);
    } finally {
      clock.mockRestore();
    }
    expect(review).toContain(
      language === 'en'
        ? 'Ready to review: 0 · New words left today: 1'
        : '\u73b0\u5728\u5f85\u590d\u4e60\uff1a0 \u00b7 \u4eca\u5929\u8fd8\u53ef\u5b66\u7684\u65b0\u8bcd\uff1a1',
    );
    expect(review).not.toContain(
      language === 'en' ? 'New words left today: 18' : '\u4eca\u5929\u8fd8\u53ef\u5b66\u7684\u65b0\u8bcd\uff1a18',
    );
    const home = render(<VocabularyHome model={current} book={book} pending={false} />);
    expect(home).toContain(language === 'en' ? 'Learn 1 new word' : '\u5b66\u4e60 1 \u4e2a\u65b0\u8bcd');
  });
}

test('both locales remove the superseded Overview action and allowance keys', () => {
  for (const locale of [en, zh]) {
    expect(locale.vocab).not.toHaveProperty('continue');
    expect(locale.vocab).not.toHaveProperty('remaining');
  }
});
