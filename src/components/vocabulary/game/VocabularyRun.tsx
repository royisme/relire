/**
 * Retrieval before reveal, then the plain review's rating path. Owns challenges, keys, chunks and focus,
 * not scheduling or vocabulary writes.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, EqualApproximately, X } from 'lucide-react';
import type { VocabularyBook, VocabularyBookSource, VocabularyOutcome, VocabularyRow } from '../../../types/vocabulary';
import type { VocabularyModel } from '../../../hooks/useVocabulary';
import { useVocabularyReview } from '../../../hooks/useVocabularyReview';
import { formatDate } from '../../../utils/srs';
import { getAppSettings, practiceGrading, saveAppSettings } from '../../../utils/appSettings';
import { appendRunLog } from '../../../services/vocabulary/game/runLog';
import { getSpeechState, speechKey, stopSpeech } from '../../../utils/speech';
import { lexiconFormsOf } from '../../../services/lexicon/load';
import {
  buildChallenge,
  cardContent,
  challengeSeed,
  cleanHeadword,
  gradeChoice,
  gradeTyped,
  type ChallengePoolItem,
} from '../../../services/vocabulary/game/challenge';
import { Button } from '../../ui/button';
import { Segmented } from '../../ui/segmented';
import { Sheet, OverlayHeader } from '../../ui/overlay';
import { Link } from '../../shell/Link';
import {
  choiceOf,
  deviceVoiceReady,
  flipReveals,
  giveUpReveals,
  ownedByAnotherControl,
  runKey,
  runPhase,
  runTarget,
  type RunCardState,
} from './runKey';
import { RunChallengeCard, RunRevealedCard } from './RunCard';
import { RunCleared, RunDone, runNextDue } from './RunEnd';

export * from './runKey';
export * from './RunCard';
export * from './RunEnd';

const outcomes = ['forgot', 'fuzzy', 'remembered'] as const;
const recallIcons = { forgot: X, fuzzy: EqualApproximately, remembered: Check };
const recallColors = {
  forgot: 'border-bad-200 bg-bad-50 text-bad-700 hover:bg-bad-100',
  fuzzy: 'border-ink-300 bg-ink-100 text-ink-800 hover:bg-ink-200',
  remembered: 'border-ok-200 bg-ok-50 text-ok-800 hover:bg-ok-100',
};

/** The selectable run lengths, in ratings (fork 1b: 20 by default, 5 for a low-energy day). */
export const RUN_SIZES = [5, 10, 20] as const;
export type RunSize = (typeof RUN_SIZES)[number];

/** One chunk of a run: its length and the rating count it started from. */
export interface RunChunk {
  size: RunSize;
  baseline: number;
}

/** The ratings done inside the current chunk; never below zero. */
export const chunkRatings = (chunk: RunChunk, ratings: number) => Math.max(0, ratings - chunk.baseline);

/** A run is done for now once its chunk of ratings is reached. */
export const chunkReached = (chunk: RunChunk, ratings: number) => chunkRatings(chunk, ratings) >= chunk.size;

/** Continue keeps the same run (and the hook's exclusions) and counts the next chunk from where this one ended. */
export const continueChunk = (chunk: RunChunk, ratings: number): RunChunk => ({ ...chunk, baseline: ratings });

/**
 * A closed-class headword (preposition, conjunction, article, pronoun, possessive) has several defensible
 * answers in a blank, so its card never gets a cloze: the build hands VG1 a card without examples and its own
 * ladder falls to the next easier kind. The book's free-text POS strings carry OCR noise (`prêp.`, `loc.prép.`),
 * so the marks are matched accent-insensitively anywhere in the string.
 */
const CLOSED_CLASS_MARKS = ['prep', 'conj', 'pron', 'poss', 'art'];
export function closedClassPos(pos: string | undefined): boolean {
  if (!pos) return false;
  const plain = pos.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return CLOSED_CLASS_MARKS.some((mark) => plain.includes(mark));
}

/** The card's leading part of speech: its book sense first, then its personal definition, as VG1 reads content. */
export function posOf(card: {
  bookSource?: VocabularyBookSource;
  contexts: VocabularyRow['contexts'];
}): string | undefined {
  return cardContent(card, 'en').pos;
}

/** One distractor source: a card of the learner's own, with the glosses and POS VG1's pool reads. */
function poolItemOf(row: VocabularyRow): ChallengePoolItem {
  const content = cardContent(row, 'en');
  return {
    word: row.word,
    gloss: { en: content.gloss, zh: cardContent(row, 'zh').gloss },
    pos: content.pos,
    ...(content.deck !== undefined ? { deck: content.deck } : {}),
  };
}

/** Where distractors come from: the learner's own cards, then the book when it is present. */
export function runPool(rows: readonly VocabularyRow[], book?: VocabularyBook): ChallengePoolItem[] {
  return [
    ...rows.map(poolItemOf),
    ...(book?.entries ?? []).map((entry) => ({
      word: entry.word,
      gloss: entry.senses[0]?.gloss ?? {},
      pos: entry.senses[0]?.pos,
    })),
  ];
}

export function VocabularyRun({ model, book }: { model: VocabularyModel; book?: VocabularyBook }) {
  const { t, i18n } = useTranslation();
  const session = useVocabularyReview(model, book);
  const [chunk, setChunk] = useState<RunChunk>({ size: 20, baseline: 0 });
  const [card, setCard] = useState<RunCardState | null>(null);
  const [typed, setTyped] = useState('');
  const [errorOpen, setErrorOpen] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(deviceVoiceReady);
  const appearances = useRef(new Map<string, number>());
  const loggedBaseline = useRef<number | null>(null);
  const submittedControl = useRef<HTMLButtonElement | null>(null);
  const recallControls = useRef<Partial<Record<VocabularyOutcome, HTMLButtonElement | null>>>({});
  // The first control of a card is sometimes a button and sometimes the typed field, so a callback keeps it.
  const firstControl = useRef<HTMLElement | null>(null);
  const takeFirstControl = (node: HTMLElement | null) => {
    firstControl.current = node;
  };
  const revealControl = useRef<HTMLButtonElement>(null);
  const wordHeading = useRef<HTMLHeadingElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const held = useRef(new Set<string>());
  const ownedSpeech = useRef<string | null>(null);
  const stopOwned = () => {
    if (ownedSpeech.current && getSpeechState().key === ownedSpeech.current) stopSpeech();
    ownedSpeech.current = null;
  };
  const active = session.active;
  const key = active?.candidate.key ?? null;
  const revealed = session.revealed;
  const phase = runPhase(card, revealed);
  // Reset during render, so a replaced or stale card cannot paint a previous card's challenge or answer.
  if ((card?.key ?? null) !== key) {
    setCard(key ? { key, ready: false, challenge: undefined, result: null } : null);
    setTyped('');
  }
  const message = session.error ?? (session.quotaReached ? t('vocab.quotaReached') : null);

  // The device voice decides whether `listen` is offered at all; Chrome fills the voice list after the first
  // frame, so the answer is re-read whenever the platform says its voices changed.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const voices = () => setVoiceAvailable(deviceVoiceReady());
    voices();
    synth.addEventListener('voiceschanged', voices);
    return () => synth.removeEventListener('voiceschanged', voices);
  }, []);

  useEffect(() => () => stopOwned(), [key]);

  // One challenge per card appearance: seeded by the local date, the word key and the appearance index
  // (history length plus this session's earlier appearances of the card), so a card that comes back through a
  // learning step shows different options in a different order.
  useEffect(() => {
    if (!active || active.candidate.key !== key) return;
    const seen = appearances.current.get(key) ?? 0;
    appearances.current.set(key, seen + 1);
    let live = true;
    // The lexicon only sharpens the cloze finder; a card whose forms did not load falls to the easier kinds.
    void lexiconFormsOf(cleanHeadword(active.candidate.word))
      .catch(() => undefined)
      .then((forms) => {
        if (!live) return;
        const cardInput = {
          word: active.candidate.word,
          bookSource: active.candidate.bookSource,
          contexts: active.row?.contexts ?? [],
          schedule: active.row?.schedule ?? null,
        };
        // A closed-class headword never gets a cloze, so VG1's ladder sees a card without examples.
        const input = closedClassPos(posOf(cardInput))
          ? {
              ...cardInput,
              bookSource: cardInput.bookSource && {
                ...cardInput.bookSource,
                senses: cardInput.bookSource.senses.map((sense) => ({ ...sense, examples: [] })),
              },
              contexts: [],
            }
          : cardInput;
        setCard({
          key,
          ready: true,
          // buildChallenge asks formsOf for this one card's lemma only, so its set answers for it.
          challenge: buildChallenge({
            card: input,
            pool: runPool(model.rows, book),
            seed: challengeSeed(formatDate(new Date(session.now)), key, (active.row?.history.length ?? 0) + seen),
            lang: i18n.resolvedLanguage === 'zh' ? 'zh' : 'en',
            voiceAvailable,
            formsOf: forms ? () => forms : undefined,
          }),
          result: null,
        });
      });
    return () => {
      live = false;
    };
    // The build reads the card as it appeared; a later row or voice change shapes the next card instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const pick = (index: number) => {
    const challenge = card?.challenge;
    if (!card || phase !== 'challenge' || !challenge) return;
    const choice = choiceOf(challenge);
    if (!choice || index >= choice.options.length) return;
    setCard({ ...card, result: { gave: choice.options[index], grade: gradeChoice(choice, index) } });
  };

  const submitTyped = () => {
    const challenge = card?.challenge;
    if (!card || phase !== 'challenge' || !challenge || challenge.kind === 'recognize' || choiceOf(challenge)) return;
    const gave = typed.trim();
    if (!gave) return;
    setCard({ ...card, result: { gave, grade: gradeTyped(challenge, gave, practiceGrading()) } });
  };

  // "I don't know" gives up on the challenge and reveals, exactly like the plain review's flip; it never skips.
  const giveUp = () => {
    if (giveUpReveals(phase)) void session.reveal();
  };
  const justFlip = () => {
    if (flipReveals(revealed)) void session.reveal();
  };
  const rate = (outcome: VocabularyOutcome) => {
    submittedControl.current = recallControls.current[outcome] ?? null;
    void session.recall(outcome);
  };

  useLayoutEffect(() => {
    if (chunkReached(chunk, session.ratings)) {
      doneHeading.current?.focus({ preventScroll: true });
      return;
    }
    if (!active) return;
    if (phase === 'revealed') wordHeading.current?.focus({ preventScroll: true });
    else if (phase === 'answered') revealControl.current?.focus({ preventScroll: true });
    else firstControl.current?.focus({ preventScroll: true });
  }, [phase, key, chunk, session.ratings, active]);

  // Disabled controls lose focus; wait until React has committed their re-enabled state before restoring it.
  useLayoutEffect(() => {
    if (session.busy) return;
    const control = submittedControl.current;
    submittedControl.current = null;
    if (message && control?.isConnected && !control.disabled) control.focus({ preventScroll: true });
  }, [session.busy, message]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (chunkReached(chunk, session.ratings)) return;
      const spot = runTarget(event.target);
      const outcome = runKey(event.key, {
        repeated: event.repeat || held.current.has(event.code),
        composing: event.isComposing || event.keyCode === 229,
        foreignControl: ownedByAnotherControl(event.target),
        overlayOpen: document.querySelector('[role="dialog"], [role="menu"]') !== null,
        busy: session.busy,
        revealed,
        answered: phase === 'answered',
        choice: spot.choice,
        onRunButton: spot.onRunButton,
        options: phase === 'challenge' && card?.challenge ? (choiceOf(card.challenge)?.options.length ?? 0) : 0,
      });
      held.current.add(event.code);
      if (outcome.preventDefault) event.preventDefault();
      if (!outcome.action) return;
      if (outcome.action.kind === 'pick') pick(outcome.action.index);
      else if (outcome.action.kind === 'reveal') void session.reveal();
      else rate(outcome.action.outcome);
    };
    const keyup = (event: KeyboardEvent) => held.current.delete(event.code);
    const blur = () => held.current.clear();
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', blur);
    };
  });

  useEffect(() => {
    if (!chunkReached(chunk, session.ratings) || loggedBaseline.current === chunk.baseline) return;
    loggedBaseline.current = chunk.baseline;
    saveAppSettings({
      vocabularyRunLog: appendRunLog(getAppSettings().vocabularyRunLog, {
        date: formatDate(new Date(session.now)),
        mode: 'game',
        chunkSize: chunk.size,
        ratings: chunkRatings(chunk, session.ratings),
      }),
    });
  }, [chunk, session.ratings, session.now]);

  const nextDue = runNextDue(model.rows, session.now);
  return (
    <div
      data-vocabulary-run
      className="space-y-5"
      tabIndex={-1}
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest('button');
        if (button) submittedControl.current = button;
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link
          to={{ name: 'study', tab: 'words' }}
          className="inline-flex min-h-10 items-center text-accent-900 underline"
        >
          {t('vocab.back')}
        </Link>
        <span className="tnum">
          {t('vocab.sessionCounts', { ratings: session.ratings, introductions: session.introductions })}
        </span>
      </div>
      <p className="tnum text-sm text-ink-600">
        {t('vocab.reviewCounts', { due: session.due, remaining: session.remaining })}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tnum text-sm text-ink-600">
          {t('vocab.game.chunkProgress', {
            done: Math.min(chunkRatings(chunk, session.ratings), chunk.size),
            size: chunk.size,
          })}
        </p>
        <Segmented
          label={t('vocab.game.runLength')}
          options={RUN_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          value={String(chunk.size)}
          onChange={(size) => setChunk((current) => ({ ...current, size: Number(size) as RunSize }))}
        />
      </div>
      {chunkReached(chunk, session.ratings) ? (
        <RunDone
          ratings={chunkRatings(chunk, session.ratings)}
          rows={model.rows}
          now={session.now}
          due={session.due}
          nextDue={nextDue}
          heading={doneHeading}
          onContinue={() => setChunk(continueChunk(chunk, session.ratings))}
        />
      ) : !active ? (
        <>
          <RunCleared nextDue={nextDue} />
          <div
            data-vocabulary-status
            role="status"
            aria-live="polite"
            className="flex h-16 min-w-0 items-start gap-2 overflow-hidden text-sm"
          >
            {message && (
              <>
                <span className="line-clamp-2 min-w-0 flex-1 break-words text-bad-700">{message}</span>
                <Button
                  variant="ghost"
                  className="w-28 shrink-0 whitespace-normal px-2 text-xs"
                  onClick={() => setErrorOpen(true)}
                >
                  {t('vocab.errorDetails')}
                </Button>
                {session.error && (
                  <Button variant="outline" className="shrink-0" onClick={session.retry}>
                    {t('common.retry')}
                  </Button>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="mx-auto w-full max-w-[25rem] space-y-6">
          <div className="rounded-lg border border-ink-200 bg-surface p-5">
            {phase === 'revealed' && active ? (
              <RunRevealedCard
                word={active.candidate.word}
                answer={{ ...active.candidate, row: active.row }}
                wordHeading={wordHeading}
                onListen={() => {
                  ownedSpeech.current = speechKey(active.candidate.word);
                }}
              />
            ) : (
              <RunChallengeCard
                word={active.candidate.word}
                phase={phase === 'revealed' ? 'answered' : phase}
                challenge={card?.challenge}
                result={card?.result ?? null}
                typed={typed}
                busy={session.busy}
                onTypedChange={setTyped}
                onPick={pick}
                onTypedSubmit={submitTyped}
                onGiveUp={giveUp}
                onJustFlip={justFlip}
                onReveal={justFlip}
                firstControl={takeFirstControl}
                revealControl={revealControl}
              />
            )}
          </div>
          {revealed && (
            <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
              {outcomes.map((outcome) => {
                const Icon = recallIcons[outcome];
                return (
                  <div key={outcome} className="flex min-w-0 flex-col items-center gap-1.5">
                    <Button
                      ref={(control) => {
                        recallControls.current[outcome] = control;
                      }}
                      type="button"
                      data-run-key
                      variant="outline"
                      size="icon"
                      className={`h-12 w-12 shrink-0 rounded-full ${recallColors[outcome]}`}
                      disabled={session.busy || (!!session.pending && session.pending.outcome !== outcome)}
                      aria-label={t(`vocab.${outcome}`)}
                      aria-pressed={session.pending?.outcome === outcome}
                      aria-busy={session.busy && session.pending?.outcome === outcome}
                      onClick={() => rate(outcome)}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    <span className="text-center text-xs text-ink-700">{t(`vocab.${outcome}`)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div
            data-vocabulary-status
            className="flex h-16 min-w-0 items-start gap-2 overflow-hidden text-sm text-ink-600"
            role="status"
            aria-live="polite"
          >
            {session.busy ? (
              t('vocab.saving')
            ) : message ? (
              <>
                <span className="line-clamp-2 min-w-0 flex-1 break-words text-bad-700">{message}</span>
                <Button
                  variant="ghost"
                  className="w-28 shrink-0 whitespace-normal px-2 text-xs"
                  onClick={() => setErrorOpen(true)}
                >
                  {t('vocab.errorDetails')}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      )}
      {errorOpen && (
        <Sheet label={t('vocab.errorDetails')} onClose={() => setErrorOpen(false)}>
          <OverlayHeader
            title={t('vocab.errorDetails')}
            closeLabel={t('common.close')}
            onClose={() => setErrorOpen(false)}
          />
          <p role="alert" className="overflow-auto break-words p-5 text-sm text-bad-700">
            {message}
          </p>
        </Sheet>
      )}
    </div>
  );
}
