/** VG3 markup and device-log integration. No browser, phone or visual acceptance. */
import { expect, spyOn, test } from 'bun:test';
import type { EffectCallback, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { testMatureSchedule, testRow } from './fixtures/vocabulary';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { RunChunk } from '../src/components/vocabulary/game/VocabularyRun';
import { getAppSettings } from '../src/utils/appSettings';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';

const React = await import('react');

// Routes read window on import; effects are driven explicitly below, with no browser event installation.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const run = await import('../src/components/vocabulary/game/VocabularyRun');
const { VocabularyHome } = await import('../src/components/vocabulary/VocabularyHome');
const review = await import('../src/hooks/useVocabularyReview');
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

for (const language of ['en', 'zh'] as const) {
  test(`${language}: home marks and count use real history, including the empty week`, async () => {
    await i18n.changeLanguage(language);
    const empty = render(<VocabularyHome model={model} />);
    expect(empty).toContain(i18n.t('vocab.rhythm.count', { days: 0 }));
    expect(empty.match(/<time /g)).toHaveLength(7);
    expect(empty).not.toContain(i18n.t('vocab.rhythm.ratedDay', { date: '2026-10-25' }));
    const row = testRow();
    const schedule = { ...testMatureSchedule(now), scheduledDays: 21 };
    row.history = [19, 21, 23, 25].map((day, index) => ({
      operationId: `test-${index}`,
      reviewedAt: new Date(2026, 9, day, 12).getTime(),
      outcome: 'remembered',
      retentionPercent: 90,
      prior: schedule,
      next: schedule,
      revision: index + 1,
    }));
    row.schedule = { ...schedule, phase: 'relearning', scheduledDays: 0 };
    const home = render(<VocabularyHome model={{ ...model, rows: [row] }} />);
    expect(home).toContain(i18n.t('vocab.rhythm.count', { days: 4 }));
    expect(home.match(/<time /g)).toHaveLength(7);
    for (const day of [19, 21, 23, 25]) {
      expect(home).toContain(i18n.t('vocab.rhythm.ratedDay', { date: `2026-10-${day}` }));
    }
    const done = render(
      <run.RunDone
        ratings={5}
        rows={[row]}
        now={now}
        due={0}
        nextDue={null}
        onContinue={() => {}}
        heading={{ current: null }}
      />,
    );
    expect(done).toContain(i18n.t('vocab.game.now'));
    expect(done).toContain(i18n.t('vocab.game.keptNow', { review: 0, mature: 0 }));
    expect(done).toContain(i18n.t('vocab.game.gainedThisWeek'));
    expect(done).toContain(i18n.t('vocab.game.firstMature', { words: 1 }));
    expect(done).toContain('tabindex="-1"');
    expect(done.match(/role="status"/g)).toHaveLength(1);
  });
}

test('a reached chunk logs once across effect replay, clock ticks and size changes; Continue logs the next chunk', () => {
  freshSettingsStorage();
  let ratings = 19;
  let chunk: RunChunk = { size: 20, baseline: 0 };
  let clock = now;
  const session = spyOn(review, 'useVocabularyReview').mockImplementation(() => ({
    active: null,
    revealed: false,
    busy: false,
    error: null,
    quotaReached: false,
    pending: null,
    ratings,
    introductions: 0,
    now: clock,
    nextDue: null,
    due: 0,
    remaining: 20,
    reveal: async () => true,
    recall: async () => {},
    skip: () => {},
    retry: () => {},
  }));
  const useState = React.useState;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const result = useState(initial);
    return initial && typeof initial === 'object' && 'baseline' in initial ? [chunk, () => {}] : result;
  }) as typeof React.useState);
  const refs: unknown[] = [];
  let index = 0;
  const ref = spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const slot = index++;
    if (!(slot in refs)) refs[slot] = { current: initial };
    return refs[slot];
  }) as typeof React.useRef);
  const effects: EffectCallback[] = [];
  const effect = spyOn(React, 'useEffect').mockImplementation((callback, dependencies) => {
    if (dependencies?.[0] === chunk) effects.push(callback);
  });
  const paint = () => {
    index = 0;
    effects.length = 0;
    const html = render(<run.VocabularyRun model={model} />);
    expect(effects).toHaveLength(1);
    effects[0]();
    effects[0](); // React Strict Mode replays effects with the same refs.
    return html;
  };
  try {
    paint();
    expect(getAppSettings().vocabularyRunLog).toEqual([]);
    ratings = 20;
    // The summary must win even while the hook clears active between cards, including the last card.
    expect(paint()).toContain(i18n.t('vocab.game.doneTitle'));
    expect(getAppSettings().vocabularyRunLog).toEqual([
      { date: '2026-10-25', mode: 'game', chunkSize: 20, ratings: 20 },
    ]);
    clock += 1000;
    paint();
    chunk = { ...chunk, size: 10 };
    paint();
    expect(getAppSettings().vocabularyRunLog).toHaveLength(1);
    chunk = run.continueChunk({ ...chunk, size: 20 }, ratings);
    ratings = 39;
    paint();
    expect(getAppSettings().vocabularyRunLog).toHaveLength(1);
    ratings = 40;
    paint();
    expect(getAppSettings().vocabularyRunLog).toHaveLength(2);
    expect(getAppSettings().vocabularyRunLog[1]).toEqual({
      date: '2026-10-25',
      mode: 'game',
      chunkSize: 20,
      ratings: 20,
    });
    expect(model.rows).toEqual([]);
  } finally {
    effect.mockRestore();
    ref.mockRestore();
    state.mockRestore();
    session.mockRestore();
    restoreSettingsStorage();
  }
});
