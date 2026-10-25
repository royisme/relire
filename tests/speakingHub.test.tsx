/** Static composition and live-count lifecycle contracts; no browser, real speech or AI. */
import { afterAll, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import * as translations from 'react-i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import '../src/i18n';
import { FRENCH_IPA } from '../src/data/frenchIpa';
import * as storage from '../src/storage/exercises';
import * as accuracyHook from '../src/hooks/useExerciseAccuracy';
import { testRow } from './fixtures/vocabulary';
import { dialogBody } from './fixtures/dialogBody';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    location: { hash: '' },
    relireHistory: { read: () => 0 },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'TEST' },
  }),
});
const { SpeakingPage } = await import('../src/components/practice/SpeakingPage');
const { AddExercisesDialog } = await import('../src/components/practice/AddExercisesDialog');
const { SoundContrastCounts } = await import('../src/components/speaking/SoundContrastCounts');
const { AnalyticsDashboard } = await import('../src/components/AnalyticsDashboard');
afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const noop = () => {};
type CountsState = { counts: storage.ContrastCount[]; loading: boolean; error: string };

function render(node: React.ReactNode, counts?: CountsState) {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    useStore(subscribe, snapshot, server ?? snapshot),
  );
  const useState = React.useState;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const pair = useState(initial);
    return counts && initial && typeof initial === 'object' && 'counts' in initial ? [counts, pair[1]] : pair;
  }) as typeof React.useState);
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    state.mockRestore();
    store.mockRestore();
  }
}

function elements(tree: React.ReactNode) {
  const found: React.ReactElement<Record<string, unknown>>[] = [];
  function visit(node: React.ReactNode) {
    if (!React.isValidElement<Record<string, unknown>>(node)) return;
    found.push(node);
    React.Children.forEach(node.props.children as React.ReactNode, visit);
  }
  visit(tree);
  return found;
}

for (const language of ['en', 'zh']) {
  test(`${language}: Speaking landing orders Read aloud, Sound pairs, Letter sounds, then the full French sounds chart`, async () => {
    await i18n.changeLanguage(language);
    const landing = <SpeakingPage articles={[]} workspace={false} onAssessed={noop} onMissingKey={noop} />;
    const loading = render(landing);
    expect(loading.indexOf('href="#/speaking/read-aloud"')).toBeLessThan(loading.indexOf('id="sound-pairs-title"'));
    expect(loading.indexOf('id="letter-sounds-title"')).toBeGreaterThan(loading.indexOf('id="sound-pairs-title"'));
    expect(loading.indexOf('id="french-sounds-title"')).toBeGreaterThan(loading.indexOf('id="letter-sounds-title"'));
    expect(loading).toContain(i18n.t('spellingSounds.title'));
    expect(loading).toContain(i18n.t('spellingSounds.intro'));
    expect(loading).toContain(i18n.t('minimalPairs.drill.description'));
    expect(loading).toContain(i18n.t('minimalPairs.drill.make'));
    expect(loading).toContain(i18n.t('exerciseProgress.loading'));
    for (const group of ['vowels', 'nasals', 'semivowels', 'consonants'] as const) {
      expect(loading).toContain(i18n.t(`ipa.${group}`));
      for (const sound of FRENCH_IPA[group]) {
        expect(loading).toContain(`aria-label="${i18n.t('ipa.play', { word: sound.word, symbol: sound.symbol })}"`);
      }
    }
    const empty = render(landing, { counts: [], loading: false, error: '' });
    expect(empty).toContain(i18n.t('minimalPairs.progress.empty'));
    const failed = render(landing, { counts: [], loading: false, error: 'TEST read refused' });
    expect(failed).toContain(i18n.t('exerciseProgress.readFailed', { reason: 'TEST read refused' }));
    expect(failed).not.toContain(i18n.t('minimalPairs.progress.empty'));
    const answered = render(landing, {
      counts: [{ contrast: 'y-u', correct: 2, total: 3 }],
      loading: false,
      error: '',
    });
    expect(answered).toContain('/y/ ↔ /u/');
    expect(answered).toContain(i18n.t('minimalPairs.progress.counts', { correct: 2, total: 3 }));
    expect(answered).not.toContain('/b/ ↔ /p/');
    // Count rows and status reserve the same slots in every state, ahead of the reference chart.
    for (const html of [loading, empty, failed, answered]) {
      expect(html).toContain('h-72 overflow-y-auto');
      expect(html).toContain('h-16 overflow-auto');
    }
    const chooser = render(<SpeakingPage articles={[]} workspace onAssessed={noop} onMissingKey={noop} />);
    expect(chooser).not.toContain('id="sound-pairs-title"');
    expect(chooser).not.toContain('id="french-sounds-title"');
    expect(chooser).not.toContain('id="letter-sounds-title"');
  });

  test(`${language}: Progress keeps real stats, grammar accuracy/adaptive drills and recent scores, not sound study content`, async () => {
    await i18n.changeLanguage(language);
    const accuracy = spyOn(accuracyHook, 'useExerciseAccuracy').mockReturnValue({
      tags: [{ grammarTag: 'gender-number', correct: 3, total: 4, accuracy: 0.75 }],
      loading: false,
      error: '',
    });
    try {
      const html = render(
        <AnalyticsDashboard
          stats={{
            sentencesAnalyzed: 6,
            shadowingSessionsCompleted: 4,
            averagePronunciationScore: 83,
            pronunciationHistory: [{ date: '2026-10-24', text: 'TEST spoken sentence', score: 83 }],
          }}
          vocabList={[{ ...testRow(), bookmarked: true }, testRow('TEST other')]}
          onMissingKey={noop}
        />,
      );
      const plain = html.replace(/<[^>]*>/g, '');
      expect(plain).toContain(`${i18n.t('vocab.bookmarked')}1`);
      expect(plain).toContain(`${i18n.t('analytics.avgScore')}83/100`);
      expect(plain).toContain(`${i18n.t('analytics.oralSessions')}4`);
      expect(plain).toContain(i18n.t('analytics.sentencesCount', { count: 6 }));
      for (const key of ['exerciseProgress.title', 'adaptive.title', 'analytics.scoreHistory'])
        expect(html).toContain(i18n.t(key));
      expect(html).toContain(i18n.t('exerciseProgress.accuracy', { percent: 75, correct: 3, total: 4 }));
      expect(html).toContain('TEST spoken sentence');
      expect(html).toContain('2026-10-24');
      for (const key of ['ipa.title', 'minimalPairs.drill.title', 'minimalPairs.progress.title'])
        expect(html).not.toContain(i18n.t(key));
      expect(html).not.toContain('french-sounds-title');
      expect(html).not.toContain('sound-contrast-title');
    } finally {
      accuracy.mockRestore();
    }
  });
}

test('Speaking action opens the shared dialog on Sound pairs in Listening and Close resets the entry', () => {
  let adding = false;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => [
    typeof initial === 'boolean' ? adding : initial,
    (value: boolean) => {
      adding = value;
    },
  ]) as typeof React.useState);
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: (key: string) => key } as never);
  try {
    const props = { articles: [], workspace: false, onAssessed: noop, onMissingKey: noop };
    const tree = () => elements(SpeakingPage(props));
    const action = tree().find((element) => element.props.children === 'minimalPairs.drill.make')!;
    (action.props.onClick as () => void)();
    const dialog = tree().find((element) => element.props.initialChoice === 'pairs')!;
    expect(dialog.props.area).toBe('listening');
    expect(dialog.props.onMissingKey).toBe(noop);
    (dialog.props.onClose as () => void)();
    expect(tree().some((element) => element.props.initialChoice === 'pairs')).toBe(false);
  } finally {
    state.mockRestore();
    translation.mockRestore();
  }
  // The shared dialog accepts that entry choice and immediately mounts its existing lazy drill form.
  // The Dialog portals on the client only, so its content is rendered without the wrapper.
  const Body = dialogBody(AddExercisesDialog, {
    articles: [],
    area: 'listening',
    initialChoice: 'pairs',
    onMissingKey: noop,
    onClose: noop,
  } as const);
  const dialog = render(<Body />);
  expect(dialog).toContain('aria-pressed="true"');
  expect(dialog).toContain('min-h-96');
});

test('moved counts still subscribe, surface read errors, reject stale reads and ignore completion after unmount', async () => {
  let current: CountsState;
  let effect: React.EffectCallback | undefined;
  let changed: () => void = noop;
  const unsubscribe = () => {
    changed = noop;
  };
  const pending: ((counts: storage.ContrastCount[]) => void)[] = [];
  const read = spyOn(storage, 'countsBySoundContrast').mockImplementation(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const subscribe = spyOn(storage, 'subscribeExercises').mockImplementation((callback) => {
    changed = callback;
    return unsubscribe;
  });
  const state = spyOn(React, 'useState').mockImplementation(((initial: CountsState) => {
    current ??= initial;
    return [
      current,
      (next: CountsState) => {
        current = next;
      },
    ];
  }) as typeof React.useState);
  const effects = spyOn(React, 'useEffect').mockImplementation((callback) => {
    effect = callback;
  });
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: (key: string) => key } as never);
  try {
    SoundContrastCounts();
    const cleanup = effect!() as () => void;
    expect(current!.loading).toBe(true);
    changed();
    pending[1]([{ contrast: 'y-u', correct: 1, total: 2 }]);
    await Bun.sleep(0);
    pending[0]([]);
    await Bun.sleep(0);
    expect(current!.counts).toEqual([{ contrast: 'y-u', correct: 1, total: 2 }]);
    read.mockRejectedValueOnce(new Error('TEST disk refused'));
    changed();
    await Bun.sleep(0);
    expect(current!).toEqual({ counts: [], loading: false, error: 'TEST disk refused' });
    changed();
    cleanup();
    pending[2]([{ contrast: 'b-p', correct: 3, total: 3 }]);
    await Bun.sleep(0);
    expect(current!.loading).toBe(true);
    expect(current!.counts).toEqual([]);
    const calls = read.mock.calls.length;
    changed();
    expect(read).toHaveBeenCalledTimes(calls);
  } finally {
    for (const spy of [read, subscribe, state, effects, translation]) spy.mockRestore();
  }
});
