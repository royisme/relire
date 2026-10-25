/**
 * The vocabulary run as the app builds it: the chunk counter, the challenge-to-view mapping, the closed-class
 * and pool rules, the key guard, and the card/end-screen contracts as static markup. No browser, no real
 * keyboard, no visual acceptance: the look at 360 px, the three themes, IME and a phone stay owner-manual.
 */
import { expect, spyOn, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { testBook, testMatureSchedule, testRow } from './fixtures/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import type { VocabularyRow, VocabularySchedule } from '../src/types/vocabulary';
import {
  buildChallenge,
  type Challenge,
  type ClozeChallenge,
  type ListenChallenge,
  type ProduceChallenge,
  type RecognizeChallenge,
} from '../src/services/vocabulary/game/challenge';

// The run's link, settings and key modules read `window` and `localStorage` when they load; the card and the
// end screens are rendered as static markup, so this browser stand-in lives only around the import.
const React = await import('react');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
const run = await import('../src/components/vocabulary/game/VocabularyRun');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
Reflect.deleteProperty(globalThis, 'localStorage');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => {
  // Browser-only speech stores have no server snapshot; read their idle state for this static render.
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, getSnapshot, getServerSnapshot) =>
    useStore(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot),
  );
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    store.mockRestore();
  }
};

test('a chunk counts ratings from its baseline, Continue keeps the run, and a smaller size ends it at once', () => {
  const { RUN_SIZES, chunkRatings, chunkReached, continueChunk } = run;
  expect(RUN_SIZES).toEqual([5, 10, 20]);
  const start = { size: 20 as const, baseline: 0 };
  expect(chunkRatings(start, 0)).toBe(0);
  expect(chunkReached(start, 19)).toBe(false);
  expect(chunkReached(start, 20)).toBe(true);
  // A mid-run size change re-uses the same baseline, so progress already made still counts.
  expect(chunkReached({ ...start, size: 5 }, 6)).toBe(true);
  // Continue counts the next chunk from the ratings this one ended at, in the same hook instance.
  const next = continueChunk(start, 20);
  expect(next).toEqual({ size: 20, baseline: 20 });
  expect(chunkRatings(next, 21)).toBe(1);
  expect(chunkReached(next, 39)).toBe(false);
  expect(chunkReached(next, 40)).toBe(true);
  // The counter never reports below the baseline (a stale rating count cannot invent progress).
  expect(chunkRatings({ size: 5, baseline: 10 }, 3)).toBe(0);
});

test('the finished states report the earliest future due time across learning and review cards', () => {
  const { runNextDue } = run;
  const now = 1_000;
  const schedule = (dueAt: number, phase: 'review' | 'learning'): VocabularySchedule => ({
    ...testMatureSchedule(now),
    dueAt,
    phase,
  });
  const row = (card: VocabularySchedule): VocabularyRow => ({ ...testRow('test-mot'), schedule: card });
  expect(
    runNextDue([row(schedule(2_000, 'learning')), row(schedule(1_500, 'review')), row(schedule(500, 'review'))], now),
  ).toBe(1_500);
  expect(runNextDue([row(schedule(500, 'review'))], now)).toBeNull();
  expect(runNextDue([], now)).toBeNull();
});

test('a closed-class part of speech blocks the cloze, with the book’s own noisy spellings', () => {
  const { closedClassPos } = run;
  for (const pos of [
    'prép.',
    'prêp.',
    'loc.prép.',
    'conj.',
    'loc.conj.',
    'pron.',
    'pron.indéf.',
    'a.poss.',
    'adj.poss.',
    'art.indéf.',
    'Loc.Prép.',
  ])
    expect(closedClassPos(pos)).toBe(true);
  for (const pos of ['n.m.', 'n.f.', 'v.t.', 'v.i.', 'adj.', 'adv.', 'loc.adv.', 'v.pr.'])
    expect(closedClassPos(pos)).toBe(false);
  expect(closedClassPos(undefined)).toBe(false);
  expect(closedClassPos('')).toBe(false);
});

test('the distractor pool is the learner’s own cards plus the book, with the book sense leading', async () => {
  const { runPool, posOf } = run;
  const now = 1_000;
  // A saved personal card with a reader definition: its own book sense leads the gloss, the definition the POS.
  const readerContext: VocabularyRow['contexts'][number] = {
    id: vocabularyContextKey({ sentence: 'Une phrase test-mot.', requestLanguage: 'en' }),
    sentence: 'Une phrase test-mot.',
    savedAt: now,
    requestLanguage: 'en',
    definition: {
      kind: 'reader',
      readerId: 'test-reader',
      version: 'b'.repeat(64),
      entry: {
        id: 'test-noun',
        lemma: 'test-mot',
        pos: 'noun',
        sense: 'test-sense',
        forms: ['test-mots'],
        gloss: { en: 'TEST authored gloss', zh: '测试释义' },
        gender: 'masculine',
      },
      sentenceTranslation: { en: 'TEST authored sentence translation', zh: '测试句子翻译' },
    },
  };
  const readerRow: VocabularyRow = { ...testRow('test-mot'), contexts: [readerContext] };
  expect(posOf(readerRow)).toBe('noun');
  expect(runPool([readerRow])).toEqual([
    { word: 'test-mot', gloss: { en: 'TEST meaning test-mot', zh: '测试' }, pos: 'noun' },
  ]);
  // A card with no book sense falls to its personal definition's gloss, in each language.
  const personalRow: VocabularyRow = {
    ...testRow('test-a'),
    bookSource: undefined,
    contexts: [
      {
        id: vocabularyContextKey({ sentence: 'Une phrase test-a.', requestLanguage: 'en' }),
        sentence: 'Une phrase test-a.',
        savedAt: now,
        requestLanguage: 'en',
        definition: {
          kind: 'ai',
          analysis: {
            word: 'test-a',
            lemma: 'test-a',
            partOfSpeech: 'nom TEST',
            ipa: '/test/',
            phoneticsGuide: 'TEST guide',
            translation: 'TEST meaning zh',
            translationEn: 'TEST meaning en',
          },
        },
      },
    ],
  };
  expect(runPool([personalRow])).toEqual([
    { word: 'test-a', gloss: { en: 'TEST meaning en', zh: 'TEST meaning zh' }, pos: 'nom TEST' },
  ]);
  // With the book present its entries join the pool after the learner's own cards.
  const book = await testBook(2);
  expect(runPool([readerRow], book)).toEqual([
    { word: 'test-mot', gloss: { en: 'TEST meaning test-mot', zh: '测试' }, pos: 'noun' },
    { word: 'test-0', gloss: { en: 'TEST meaning test-0', zh: '测试' }, pos: undefined },
    { word: 'test-1', gloss: { en: 'TEST meaning test-1', zh: '测试' }, pos: undefined },
  ]);
});

test('the challenge-to-view mapping: which kinds offer options and which take typing', () => {
  const { choiceOf } = run;
  const recognize: RecognizeChallenge = { kind: 'recognize', prompt: 'mot', options: ['a', 'b'], answerIndex: 0 };
  const clozeChoice: Challenge = {
    kind: 'cloze',
    before: 'Une ',
    blank: 'phrase',
    after: '.',
    expected: 'phrase',
    options: ['phrase', 'voiture'],
    answerIndex: 0,
  };
  const clozeTyped: ClozeChallenge = { kind: 'cloze', before: 'Une ', blank: 'phrase', after: '.', expected: 'phrase' };
  const listen: ListenChallenge = { kind: 'listen', clue: 'sentence', expected: 'phrase' };
  const produce: ProduceChallenge = { kind: 'produce', clue: 'sentence', expected: 'phrase' };
  expect(choiceOf(recognize)?.options).toEqual(['a', 'b']);
  expect(choiceOf(clozeChoice)?.options).toEqual(['phrase', 'voiture']);
  expect(choiceOf(clozeTyped)).toBeUndefined();
  expect(choiceOf(listen)).toBeUndefined();
  expect(choiceOf(produce)).toBeUndefined();
});

test('the card walks loading → challenge → answered → revealed, and a challenge-less card goes plain', () => {
  const { runPhase } = run;
  const challenge: Challenge = { kind: 'listen', clue: 'sentence', expected: 'phrase' };
  expect(runPhase(null, false)).toBe('loading');
  expect(runPhase({ key: 'a', ready: false, challenge: undefined, result: null }, false)).toBe('loading');
  expect(runPhase({ key: 'a', ready: true, challenge, result: null }, false)).toBe('challenge');
  expect(
    runPhase(
      { key: 'a', ready: true, challenge, result: { gave: 'x', grade: { correct: false, expected: 'phrase' } } },
      false,
    ),
  ).toBe('answered');
  expect(runPhase({ key: 'a', ready: true, challenge, result: null }, true)).toBe('revealed');
  expect(runPhase({ key: 'a', ready: true, challenge: undefined, result: null }, false)).toBe('plain');
});

test('both escapes from a challenge reveal; the run has no skip of its own', () => {
  const { giveUpReveals, flipReveals } = run;
  expect(giveUpReveals('challenge')).toBe(true);
  expect(giveUpReveals('answered')).toBe(false);
  expect(giveUpReveals('revealed')).toBe(false);
  expect(flipReveals(false)).toBe(true);
  expect(flipReveals(true)).toBe(false);
});

test('the run keys pick options, reveal after an answer and rate on the back; guarded keys never act', () => {
  const { runKey } = run;
  const quiet = {
    repeated: false,
    composing: false,
    foreignControl: false,
    overlayOpen: false,
    busy: false,
    revealed: false,
    answered: false,
    choice: null,
    onRunButton: false,
    options: 4,
  };
  expect(runKey('1', quiet)).toEqual({ action: { kind: 'pick', index: 0 }, preventDefault: true });
  expect(runKey('4', quiet)).toEqual({ action: { kind: 'pick', index: 3 }, preventDefault: true });
  // An option past the end of the offered list does nothing.
  expect(runKey('5', quiet)).toEqual({ action: null, preventDefault: false });
  // Enter/Space on a focused option button is that option's own pick, never the reveal under it.
  expect(runKey('Enter', { ...quiet, choice: 1, onRunButton: true })).toEqual({
    action: { kind: 'pick', index: 1 },
    preventDefault: true,
  });
  // After the challenge is answered, Enter and Space reveal; the option keys are inert.
  const answered = { ...quiet, answered: true, options: 0 };
  expect(runKey('Enter', answered)).toEqual({ action: { kind: 'reveal' }, preventDefault: true });
  expect(runKey(' ', answered)).toEqual({ action: { kind: 'reveal' }, preventDefault: true });
  expect(runKey('1', answered)).toEqual({ action: null, preventDefault: false });
  // On the revealed card only 1/2/3 rate, with the same outcome order as the plain review.
  const revealed = { ...quiet, revealed: true };
  expect(runKey('1', revealed)).toEqual({ action: { kind: 'rate', outcome: 'forgot' }, preventDefault: true });
  expect(runKey('2', revealed)).toEqual({ action: { kind: 'rate', outcome: 'fuzzy' }, preventDefault: true });
  expect(runKey('3', revealed)).toEqual({ action: { kind: 'rate', outcome: 'remembered' }, preventDefault: true });
  expect(runKey('4', revealed)).toEqual({ action: null, preventDefault: false });
  // A repeated, held, busy or overlay-shadowed key never acts, but on the run's own buttons the native
  // activation is still cancelled, so a held Enter cannot click an option by itself.
  for (const facts of [
    { ...quiet, repeated: true, choice: 0, onRunButton: true },
    { ...quiet, busy: true, choice: 0, onRunButton: true },
    { ...quiet, overlayOpen: true, choice: 0, onRunButton: true },
  ])
    expect(runKey('Enter', facts)).toEqual({ action: null, preventDefault: true });
  expect(runKey('1', { ...quiet, repeated: true })).toEqual({ action: null, preventDefault: false });
  // A composition keydown is never acted on and never cancelled — not even on the run's own buttons — so an
  // IME, dead keys and Android virtual keyboards keep typing their answer.
  expect(runKey('1', { ...quiet, composing: true })).toEqual({ action: null, preventDefault: false });
  expect(runKey('Enter', { ...quiet, composing: true, choice: 0, onRunButton: true })).toEqual({
    action: null,
    preventDefault: false,
  });
  // A key that belongs to another control (the typed answer, a link, another button) is left entirely alone.
  expect(runKey('1', { ...quiet, foreignControl: true })).toEqual({ action: null, preventDefault: false });
  expect(runKey('3', { ...revealed, foreignControl: true })).toEqual({ action: null, preventDefault: false });
});

const challengeCard = (props: Partial<Parameters<typeof run.RunChallengeCard>[0]> = {}) => {
  const challenge: Challenge = {
    kind: 'recognize',
    prompt: 'chanson',
    options: ['song', 'car', 'window'],
    answerIndex: 0,
  };
  return (
    <run.RunChallengeCard
      word="chanson"
      phase="challenge"
      challenge={challenge}
      result={null}
      typed=""
      busy={false}
      onTypedChange={() => {}}
      onPick={() => {}}
      onTypedSubmit={() => {}}
      onGiveUp={() => {}}
      onJustFlip={() => {}}
      onReveal={() => {}}
      firstControl={() => {}}
      revealControl={{ current: null }}
      {...props}
    />
  );
};

for (const language of ['en', 'zh'] as const) {
  test(`${language}: a meaning challenge shows the word, options with key hints, both escapes and one reserved live slot`, async () => {
    await i18n.changeLanguage(language);
    const html = render(challengeCard());
    expect(html).toContain('lang="fr"');
    expect(html).toContain('chanson');
    // The key hints sit inside the option buttons, which offer the glosses in the interface language.
    expect(html).toContain('>1</span>');
    expect(html).toContain('>2</span>');
    expect(html).not.toContain('lang="fr">song');
    expect(html).toContain(i18n.t('vocab.game.dontKnow'));
    expect(html).toContain(i18n.t('vocab.game.justFlip'));
    // The result slot is reserved before any answer, and it is the card's only live region.
    expect(html).toContain('h-24');
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    // A challenge never offers a rating: the outcome labels are absent until the card is revealed.
    expect(html).not.toContain(i18n.t('vocab.forgot'));
    expect(html).not.toContain(i18n.t('vocab.remembered'));
  });

  test(`${language}: the answered card states its verdict in words, both texts and a filled blank, then only Flip`, async () => {
    await i18n.changeLanguage(language);
    const wrong = render(
      challengeCard({ phase: 'answered', result: { gave: 'car', grade: { correct: false, expected: 'song' } } }),
    );
    expect(wrong).toContain(i18n.t('vocab.game.notRight'));
    expect(wrong).toContain(i18n.t('vocab.game.youChose', { gave: 'car', expected: 'song' }));
    expect(wrong).toContain(i18n.t('vocab.flip'));
    expect(wrong).not.toContain(i18n.t('vocab.game.dontKnow'));
    expect(wrong).toContain('text-bad-700');
    const right = render(
      challengeCard({ phase: 'answered', result: { gave: 'song', grade: { correct: true, expected: 'song' } } }),
    );
    expect(right).toContain(i18n.t('vocab.game.right'));
    expect(right).toContain('text-ok-800');
    // A choice cloze fills its blank with the sentence's own form once answered.
    const cloze: Challenge = {
      kind: 'cloze',
      before: 'Une ',
      blank: 'chanson',
      after: ' joue.',
      expected: 'chanson',
      options: ['chanson', 'voiture'],
      answerIndex: 0,
    };
    const filled = render(
      challengeCard({
        challenge: cloze,
        phase: 'answered',
        result: { gave: 'voiture', grade: { correct: false, expected: 'chanson' } },
      }),
    );
    expect(filled).toContain('Une');
    expect(filled).toContain('>chanson</span>');
    expect(filled).toContain('joue.');
    expect(filled).toContain(i18n.t('vocab.game.kindClozeChoice'));
  });

  test(`${language}: a listening or production challenge never shows the word it asks for`, async () => {
    await i18n.changeLanguage(language);
    const listen: Challenge = { kind: 'listen', clue: 'song', expected: 'chanson' };
    const heard = render(challengeCard({ challenge: listen }));
    expect(heard).toContain(i18n.t('vocab.game.kindListen'));
    expect(heard).toContain(i18n.t('vocab.game.listenWord'));
    expect(heard).toContain('song');
    expect(heard).not.toContain('chanson');
    const produce: Challenge = { kind: 'produce', clue: 'song', pos: 'n.f.', expected: 'chanson' };
    const written = render(challengeCard({ challenge: produce }));
    expect(written).toContain(i18n.t('vocab.game.kindProduce'));
    expect(written).toContain('n.f.');
    expect(written).not.toContain('chanson');
    // While the challenge is still being built the word stays hidden too, and Just flip remains available.
    const loading = render(challengeCard({ phase: 'loading', challenge: undefined }));
    expect(loading).not.toContain('chanson');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain(i18n.t('vocab.game.justFlip'));
    // A card with no challenge at all is the plain review front.
    const plain = render(challengeCard({ phase: 'plain', challenge: undefined }));
    expect(plain).toContain('chanson');
    expect(plain).toContain(i18n.t('vocab.recall'));
    expect(plain).toContain(i18n.t('vocab.flip'));
  });
}

test('the done-for-now screen states the real counts, the real next due time, Continue and the way back', async () => {
  await i18n.changeLanguage('en');
  const due = new Date(2026, 9, 24, 12, 30).getTime();
  const html = render(
    <run.RunDone
      ratings={6}
      rows={[]}
      now={due}
      due={4}
      nextDue={due}
      onContinue={() => {}}
      heading={{ current: null }}
    />,
  );
  expect(html).toContain(i18n.t('vocab.game.doneTitle'));
  expect(html).toContain(i18n.t('vocab.game.doneCounts', { ratings: 6, due: 4 }));
  expect(html).toContain(i18n.t('vocab.game.nextDue', { time: new Date(due).toLocaleString() }));
  expect(html).toContain(i18n.t('vocab.game.continueRun'));
  expect(html).toContain('href="#/words"');
  expect(html.match(/role="status"/g)).toHaveLength(1);
  const nothing = render(
    <run.RunDone
      ratings={6}
      rows={[]}
      now={due}
      due={0}
      nextDue={null}
      onContinue={() => {}}
      heading={{ current: null }}
    />,
  );
  expect(nothing).toContain(i18n.t('vocab.game.nothingWaiting'));
});

test('the queue-cleared screen says so and shows the same real next due time', async () => {
  await i18n.changeLanguage('en');
  const due = new Date(2026, 9, 25, 9, 5).getTime();
  const html = render(<run.RunCleared nextDue={due} />);
  expect(html).toContain(i18n.t('vocab.game.queueCleared'));
  expect(html).toContain(i18n.t('vocab.game.nextDue', { time: new Date(due).toLocaleString() }));
  expect(html).toContain('href="#/words"');
});

test('fewer than 3 saved words never throws, drops options to 2 or falls back to plain flip', () => {
  const { runPool, choiceOf, runPhase } = run;
  // 0 saved words: pool is empty
  expect(runPool([])).toEqual([]);
  // 1 saved word: pool has 1 item
  const row1 = testRow('mot-1');
  expect(runPool([row1])).toHaveLength(1);
  // 2 saved words: pool has 2 items
  const row2 = testRow('mot-2');
  expect(runPool([row1, row2])).toHaveLength(2);

  const cardInput = {
    word: 'mot-1',
    bookSource: row1.bookSource,
    contexts: row1.contexts,
    schedule: null,
  };
  // With 0 distractors, buildChallenge returns undefined, mapping to plain flip
  const challenge0 = buildChallenge({
    card: cardInput,
    pool: runPool([row1]),
    seed: 'test-seed',
    lang: 'en',
    voiceAvailable: false,
  });
  expect(challenge0).toBeUndefined();
  expect(runPhase({ key: 'mot-1', ready: true, challenge: challenge0, result: null }, false)).toBe('plain');

  // With 1 distractor, options drop to 2
  const challenge1 = buildChallenge({
    card: cardInput,
    pool: runPool([row1, row2]),
    seed: 'test-seed',
    lang: 'en',
    voiceAvailable: false,
  });
  expect(challenge1).toBeDefined();
  expect(choiceOf(challenge1!)?.options).toHaveLength(2);
});

test('the revealed card renders the heading, listen button and answer snapshot', async () => {
  await i18n.changeLanguage('en');
  const row = testRow('chanson');
  const html = render(
    <run.RunRevealedCard
      word="chanson"
      answer={{ word: 'chanson', key: 'chanson', bookSource: row.bookSource, builtIn: false, row }}
      wordHeading={{ current: null }}
      onListen={() => {}}
    />,
  );
  expect(html).toContain('lang="fr"');
  expect(html).toContain('chanson');
  expect(html).toContain(i18n.t('wordModal.listen'));
});
