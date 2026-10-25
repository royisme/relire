/** VG6 goal markup: every number as text in both locales, each of today's/passed states, nothing without a
 *  goal, and no forecasting wording in the added keys. No browser, phone or visual acceptance. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { testMatureSchedule, testRow } from './fixtures/vocabulary';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { VocabularyGoal } from '../src/services/vocabulary/game/goal';
import { weeklyGained } from '../src/services/vocabulary/game/rhythm';
import { saveAppSettings } from '../src/utils/appSettings';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';

// Routes read window on import; the home is rendered as static markup, with no browser event installation.
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
const mature = { ...testMatureSchedule(now), scheduledDays: 21 };
const matured = (day: number) => {
  const row = testRow();
  row.history = [
    {
      operationId: 'test-0',
      reviewedAt: new Date(2026, 9, day, 12).getTime(),
      outcome: 'remembered',
      retentionPercent: 90,
      prior: mature,
      next: mature,
      revision: 1,
    },
  ];
  row.schedule = mature;
  return row;
};
const young = testRow();
young.history = [{ ...matured(25).history[0], next: { ...mature, scheduledDays: 20 } }];
const model: VocabularyModel = {
  rows: [matured(2), matured(10), matured(19), young],
  now,
  epoch: 0,
  ready: true,
  error: null,
  preferences: { newPerDay: 20, retentionPercent: 90 },
  day: { date: '2026-10-25', introducedKeys: [] },
  refresh: async () => {},
  savePreferences: async () => {},
};
// First attainments: 10-02 falls in the oldest week, 10-10 in the second, 10-19 in the newest.
const series = weeklyGained(model.rows, now, 4);

beforeEach(freshSettingsStorage);
afterEach(restoreSettingsStorage);

for (const language of ['en', 'zh'] as const) {
  test(`${language}: the goal block shows real numbers as text, with every dated state written out`, async () => {
    await i18n.changeLanguage(language);
    const states: [VocabularyGoal, string][] = [
      [{ examDate: '2026-11-08', matureTarget: 3 }, i18n.t('vocab.goal.daysLeft', { count: 14 })],
      [{ examDate: '2026-10-25', matureTarget: 3 }, i18n.t('vocab.goal.examToday')],
      [{ examDate: '2026-10-20', matureTarget: 3 }, i18n.t('vocab.goal.examPassed')],
    ];
    for (const [goal, dayLine] of states) {
      saveAppSettings({ vocabularyGoal: goal });
      const html = render(<VocabularyHome model={model} book={undefined} loading={false} />);
      expect(html).toContain(`aria-label="${i18n.t('vocab.goal.title')}"`);
      expect(html).toContain(dayLine);
      expect(html).toContain(i18n.t('vocab.goal.progress', { mature: 3, target: 3 }));
      expect(html).toContain(i18n.t('vocab.goal.change'));
    }
  });

  test(`${language}: four weekly numbers, oldest first, each labelled with its week start date`, async () => {
    await i18n.changeLanguage(language);
    saveAppSettings({ vocabularyGoal: { examDate: '2026-11-08', matureTarget: 3 } });
    const html = render(<VocabularyHome model={model} book={undefined} loading={false} />);
    expect(series.map((week) => week.count)).toEqual([1, 1, 0, 1]);
    // Seven rhythm days plus four week labels.
    expect(html.match(/<time /g)).toHaveLength(11);
    for (const week of series) {
      expect(html).toContain(`dateTime="${week.weekStart}"`);
      expect(html).toContain(
        new Date(`${week.weekStart}T12:00:00`).toLocaleDateString(language, { month: 'short', day: 'numeric' }),
      );
      expect(html).toContain(`>${week.count}</span>`);
    }
  });
}

test('without a goal the home shows only the quiet set-a-goal control and no goal block', async () => {
  await i18n.changeLanguage('en');
  const html = render(<VocabularyHome model={model} book={undefined} loading={false} />);
  expect(html).toContain(i18n.t('vocab.goal.set'));
  expect(html).not.toContain(`aria-label="${i18n.t('vocab.goal.title')}"`);
  expect(html).not.toContain(i18n.t('vocab.goal.weekly'));
  expect(html).not.toContain(i18n.t('vocab.goal.progress', { mature: 3, target: 3 }));
  expect(html.match(/<time /g)).toHaveLength(7);
});

test('the added locale keys promise no forecast, projection or on-track judgement', () => {
  for (const locale of [en, zh]) {
    const text = JSON.stringify(locale.vocab.goal).toLowerCase();
    for (const banned of ['on track', 'forecast', 'project']) expect(text).not.toContain(banned);
  }
});
