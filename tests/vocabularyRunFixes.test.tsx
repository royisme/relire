import { expect, spyOn, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { testDefinition, testMatureSchedule, testRow } from './fixtures/vocabulary';
import { buildRunChallenge } from '../src/components/vocabulary/game/runModel';
import { RunChallengeCard, RunRevealedCard } from '../src/components/vocabulary/game/RunCard';
import type { Challenge } from '../src/services/vocabulary/game/challenge';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { VocabularyRun } = await import('../src/components/vocabulary/game/VocabularyRun');
const review = await import('../src/hooks/useVocabularyReview');
const speech = await import('../src/components/ui/speak-button');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
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
const session: ReturnType<typeof review.useVocabularyReview> = {
  active: null,
  revealed: false,
  busy: false,
  error: null,
  quotaReached: false,
  pending: null,
  ratings: 3,
  introductions: 0,
  now,
  nextDue: null,
  due: 0,
  remaining: 20,
  reveal: async () => true,
  recall: async () => {},
  skip: () => {},
  retry: () => {},
};

test('between snapshots only a genuinely empty ready queue shows completion; failures show their real error', () => {
  const hook = spyOn(review, 'useVocabularyReview').mockReturnValue(session);
  const candidate = { ...testRow('TEST'), bookmarked: true, bookmarkedAt: 1 };
  const render = (nextModel: VocabularyModel) =>
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <VocabularyRun model={nextModel} />
      </I18nextProvider>,
    );
  try {
    const loading = render({ ...model, rows: [candidate] });
    expect(loading).toContain(i18n.t('vocab.game.loadingCard'));
    expect(loading).toContain('h-[42rem]');
    expect(loading).not.toContain(i18n.t('vocab.game.queueCleared'));
    expect(render({ ...model, ready: false })).not.toContain(i18n.t('vocab.game.queueCleared'));
    expect(render(model)).toContain(i18n.t('vocab.game.queueCleared'));
    hook.mockReturnValue({ ...session, error: 'TEST snapshot disk failure' });
    const failed = render({ ...model, rows: [candidate] });
    expect(failed).toContain('TEST snapshot disk failure');
    expect(failed).toContain(i18n.t('common.retry'));
    expect(failed).not.toContain(i18n.t('vocab.game.queueCleared'));
    // Even an empty model with a failed load is not evidence of completion.
    expect(render(model)).not.toContain(i18n.t('vocab.game.queueCleared'));
  } finally {
    hook.mockRestore();
  }
});

test('closed-class AI and reader cards retain their meaning and use recognize, even on review steps', () => {
  const ai = testDefinition('avec');
  ai.analysis.partOfSpeech = 'prép.';
  ai.analysis.translationEn = 'with';
  const reader = {
    kind: 'reader' as const,
    readerId: 'TEST',
    version: 'a'.repeat(64),
    entry: {
      id: 'avec',
      lemma: 'avec',
      pos: 'function' as const,
      sense: 'TEST',
      forms: ['avec'],
      gloss: { en: 'with', zh: 'TEST' },
    },
    sentenceTranslation: { en: 'TEST', zh: 'TEST' },
  };
  for (const definition of [ai, reader]) {
    for (const phase of ['learning', 'review'] as const) {
      const card = {
        word: 'avec',
        schedule: { ...testMatureSchedule(now), phase },
        contexts: [{ id: 'TEST', sentence: 'Avec moi.', requestLanguage: 'en' as const, savedAt: now, definition }],
      };
      const challenge = buildRunChallenge({
        card,
        pool: [{ word: 'sans', gloss: { en: 'without' } }],
        seed: 'TEST',
        lang: 'en',
        voiceAvailable: true,
      });
      expect(challenge).toMatchObject({ kind: 'recognize', options: expect.arrayContaining(['with', 'without']) });
      expect(card.contexts[0].definition).toBe(definition);
      expect(card.contexts[0].sentence).toBe('Avec moi.');
    }
  }
});

test('challenge and action slots stay fixed across loading, four long choices, typing and submitted states', () => {
  const props = {
    word: 'TEST',
    result: null,
    typed: 'TEST',
    busy: false,
    onTypedChange: () => {},
    onPick: () => {},
    onTypedSubmit: () => {},
    onGiveUp: () => {},
    onJustFlip: () => {},
    onReveal: () => {},
    firstControl: () => {},
    revealControl: { current: null },
  };
  const choice: Challenge = {
    kind: 'recognize',
    prompt: 'TEST',
    options: Array.from({ length: 4 }, (_, i) => `${i} ${'TEST long option '.repeat(15)}`),
    answerIndex: 0,
  };
  const typed: Challenge = { kind: 'produce', clue: 'TEST long prompt '.repeat(40), expected: 'TEST' };
  const challenges: Challenge[] = [choice, typed];
  for (const phase of ['loading', 'challenge', 'answered'] as const) {
    for (const challenge of challenges) {
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <RunChallengeCard
            {...props}
            phase={phase}
            challenge={phase === 'loading' ? undefined : challenge}
            result={phase === 'answered' ? { gave: 'TEST', grade: { correct: true, expected: 'TEST' } } : null}
          />
        </I18nextProvider>,
      );
      expect(html).toContain('h-80 space-y-4 overflow-y-auto');
      expect(html).toContain('grid h-24 grid-cols-2 content-start');
      if (challenge === typed && phase !== 'loading') {
        expect(html).toContain('<input');
        if (phase === 'answered') expect(html).toContain('readOnly');
      }
    }
  }
});

test('the revealed game card explicitly requests device speech regardless of the selected provider', () => {
  const speak = spyOn(speech, 'SpeakButton').mockImplementation((props) => (
    <button data-engine={props.engine}>{props.text}</button>
  ));
  try {
    const row = testRow('TEST');
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <RunRevealedCard
          word="TEST"
          answer={{ ...row, builtIn: false, row }}
          wordHeading={{ current: null }}
          onListen={() => {}}
        />
      </I18nextProvider>,
    );
    expect(html).toContain('data-engine="device"');
    expect(speak.mock.calls[0][0].text).toBe('TEST');
    const hook = spyOn(review, 'useVocabularyReview');
    try {
      for (const revealed of [false, true]) {
        hook.mockReturnValue({
          ...session,
          active: { candidate: { ...row, builtIn: false }, row, tokens: { epoch: 0, resetToken: 0, revision: 0 } },
          revealed,
        });
        const run = renderToStaticMarkup(
          <I18nextProvider i18n={i18n}>
            <VocabularyRun model={model} />
          </I18nextProvider>,
        );
        expect(run).toContain('h-[42rem] overflow-y-auto');
        expect(run).toContain('class="h-20"');
      }
    } finally {
      hook.mockRestore();
    }
  } finally {
    speak.mockRestore();
  }
});
