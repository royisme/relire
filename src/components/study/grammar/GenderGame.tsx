/**
 * Grammar → Gender's one-card round: a saved twelve-noun GENDER_CHECK unit, one bare lemma at a time, only
 * each card's first answer written, and a missed card returning later in the same round. Owns the round
 * state, the document-level keys and the two fixed slots (feedback, choices + Next).
 * Does not own sampling (`fromGender`), the deck (`services/nounGender/deck`), saving (`useUnitSaver`),
 * the writes (`storage/exercises`) or the noun pack.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { errorMessage } from '../../../services/ai/errors';
import { emptyAnswer } from '../../../services/exercises/answer';
import { prepareGenderDrills } from '../../../services/exercises/fromGender';
import { effectiveStrictAccents, gradeUnitItem } from '../../../services/exercises/grading';
import {
  answerCard,
  createDeck,
  currentCard,
  summaryOf,
  wasAnswered,
  type GenderDeck,
  type GenderSummary,
} from '../../../services/nounGender/deck';
import { checkItem, getResetToken } from '../../../storage/exercises';
import type { ExerciseItem, ExerciseUnit } from '../../../types/exercises';
import type { NounGenderPack } from '../../../types/nounGender';
import { nounGenderDrillMeta, tendencyPercent } from '../../../types/nounGenderDrill';
import { useUnitSaver } from '../../../hooks/useUnitSaver';
import { practiceGrading } from '../../../utils/appSettings';
import { Link } from '../../shell/Link';
import { Button } from '../../ui/button';

/** Cards in one round: about two minutes, and the unit the round saves to Grammar → Exercises. */
export const ROUND_SIZE = 12;

/** The answer to one card: the two genders a noun can have. */
type GenderPick = 'M' | 'F';

interface Round {
  unit: ExerciseUnit;
  token: number;
  deck: GenderDeck;
  /** The card on screen, which stays until Next. */
  shown: string;
  /** The answer given to `shown`; the card is locked once it exists. */
  pick: GenderPick | null;
  /** True while the card's first answer is being written. */
  saving: boolean;
  /** The real reason that write failed; Next stays disabled until a retry succeeds. */
  error: string | null;
}

export type GenderKeyAction = 'le' | 'la' | 'next';

export interface GenderKeyOutcome {
  /** What the round does with the key, or null when the key belongs to someone else. */
  action: GenderKeyAction | null;
  /** True when the browser's own handling must be stopped even though nothing acts. */
  preventDefault: boolean;
}

export interface GenderKeyFacts {
  repeated: boolean;
  composing: boolean;
  /** Focus is in another control (a field, link or other button) that owns its keys. */
  foreignControl: boolean;
  /** A dialog or menu is open anywhere in the document. */
  overlayOpen: boolean;
  /** The card is answered: only the Next keys work. */
  answered: boolean;
  /** The choice button the key landed on, if any. */
  choice: GenderPick | null;
  /** The key landed on one of the round's own buttons (a choice or Next). */
  onRoundButton: boolean;
}

/**
 * The round's key. Guarded keys (repeating, held, IME composition) and open overlays never act, but on the
 * round's own buttons their native activation is still cancelled, so a held Enter cannot click le or Next
 * by itself. Before the answer, Enter/Space on a choice button is that button's pick, not Next; after it,
 * only Enter, Space and the right arrow advance, and the answer keys are inert.
 */
export function genderKey(key: string, facts: GenderKeyFacts): GenderKeyOutcome {
  if (facts.composing || facts.repeated || facts.overlayOpen)
    return { action: null, preventDefault: facts.onRoundButton };
  if (facts.foreignControl) return { action: null, preventDefault: false };
  if (facts.choice && !facts.answered && (key === 'Enter' || key === ' '))
    return { action: facts.choice === 'M' ? 'le' : 'la', preventDefault: true };
  if (key === 'Enter' || key === ' ' || (facts.answered && key === 'ArrowRight'))
    return { action: 'next', preventDefault: true };
  if (facts.answered) return { action: null, preventDefault: false };
  const pick = key === '1' || key === 'ArrowLeft' ? 'le' : key === '2' || key === 'ArrowRight' ? 'la' : null;
  return { action: pick, preventDefault: pick !== null };
}

/** True when focus is in a control that owns its keys; the round's own buttons are marked, so they do not count. */
function ownedByAnotherControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest('[data-gender-key]')) return false;
  return (
    target.closest('input, textarea, select, [contenteditable="true"], a, button, [role="dialog"], [role="menu"]') !==
    null
  );
}

/** Where a keydown landed among the round's own controls: on any of its buttons, and on which choice. */
function roundTarget(target: EventTarget | null): { onRoundButton: boolean; choice: GenderPick | null } {
  const button = target instanceof Element ? target.closest('[data-gender-key]') : null;
  if (!button) return { onRoundButton: false, choice: null };
  const choice = button.getAttribute('data-gender-choice');
  return { onRoundButton: true, choice: choice === 'M' || choice === 'F' ? choice : null };
}

/**
 * The round after a pick is shown: a returning card writes nothing, so it advances at once; a first answer
 * keeps the deck untouched until its write commits (the deck does not advance until it succeeds).
 */
export function showPick(round: Round, choice: GenderPick, correct: boolean): Round {
  const first = !wasAnswered(round.deck, round.shown);
  return {
    ...round,
    deck: first ? round.deck : answerCard(round.deck, round.shown, correct),
    pick: choice,
    saving: first,
    error: null,
  };
}

/** The round once the shown card's first answer is committed: only now does the deck take the answer. */
export const commitPick = (round: Round, correct: boolean): Round => ({
  ...round,
  deck: answerCard(round.deck, round.shown, correct),
  saving: false,
});

/** The unit the next open uses: one kept from a failed token read is reused as-is, so its retry never saves again. */
export const unitToOpen = (kept: ExerciseUnit | null, saved: ExerciseUnit[] | undefined): ExerciseUnit | undefined =>
  kept ?? saved?.[0];

/** Grades the card on screen locally; the reviewed pack, not the browser, decides the answer. */
function judgeCard(state: Round, choice: GenderPick) {
  const item = state.unit.items.find((candidate) => candidate.id === state.shown)!;
  const grading = practiceGrading();
  const answer = { ...emptyAnswer(item), singleAnswer: choice };
  const graded = gradeUnitItem(state.unit, item, answer, grading);
  if (graded.status !== 'graded') return null;
  return { item, answer, correct: graded.correct, strictAccents: effectiveStrictAccents(item, grading) };
}

export function GenderGame({ pack, onBack }: { pack: NounGenderPack; onBack: () => void }) {
  const { t } = useTranslation();
  const { status, save } = useUnitSaver();
  const [round, setRound] = useState<Round | null>(null);
  const [ended, setEnded] = useState(false);
  /** The real reason the round could not be opened after its unit was saved. */
  const [openError, setOpenError] = useState<string | null>(null);
  // Bumped by every round start and by unmount, so work that outlived its round cannot touch the next one.
  const session = useRef(0);
  /** The unit of the round being opened, kept across a failed token read so Retry reopens it instead of saving a second set. */
  const savedUnit = useRef<ExerciseUnit | null>(null);
  // Held keys outlive the key effect, which re-runs on every card update; otherwise an Enter held through a
  // round change is forgotten and its native repeats can click the new card's choices.
  const held = useRef(new Set<string>());

  /** Saves one round's unit and opens its deck; a replaced or unmounted round drops the result. */
  const openRound = async (kept: ExerciseUnit | null) => {
    const id = ++session.current;
    const units = kept ? undefined : await save(() => prepareGenderDrills({ pack, count: ROUND_SIZE, t }));
    const unit = unitToOpen(kept, units);
    if (!unit) return;
    savedUnit.current = unit;
    await getResetToken(unit.id).then(
      (token) => {
        if (session.current !== id) return;
        setRound({
          unit,
          token,
          deck: createDeck(unit.items.map((item) => item.id)),
          shown: unit.items[0].id,
          pick: null,
          saving: false,
          error: null,
        });
      },
      (error: unknown) => {
        if (session.current === id) setOpenError(errorMessage(error));
      },
    );
  };

  /** A round from a button: the old card and its errors go at once, then a new unit is saved. */
  const start = () => {
    savedUnit.current = null;
    setRound(null);
    setEnded(false);
    setOpenError(null);
    void openRound(null);
  };

  /** The error screen's Retry: a token-read failure reopens the same unit, a save failure re-saves the kept payload. */
  const retryOpen = () => {
    setOpenError(null);
    void openRound(savedUnit.current);
  };

  // One round per mount. A second round is the Play again button, never a re-render of this effect.
  useEffect(() => {
    const game = session;
    void openRound(null);
    return () => {
      game.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Writes the first answer of the card on screen — the one write each card gets — and commits it to the deck only once it is saved. */
  const write = useCallback(async (state: Round, choice: GenderPick) => {
    const judged = judgeCard(state, choice);
    if (!judged) return;
    const id = session.current;
    setRound((previous) => (previous ? { ...previous, saving: true, error: null } : previous));
    try {
      await checkItem({
        unitId: state.unit.id,
        itemId: judged.item.id,
        resetToken: state.token,
        answer: judged.answer,
        result: { correct: judged.correct, strictAccents: judged.strictAccents },
      });
      if (session.current === id) setRound((previous) => (previous ? commitPick(previous, judged.correct) : previous));
    } catch (error) {
      if (session.current !== id) return;
      const message = errorMessage(error);
      setRound((previous) => (previous ? { ...previous, saving: false, error: message } : previous));
    }
  }, []);

  const choose = useCallback(
    (choice: GenderPick) => {
      if (!round || round.pick) return;
      const judged = judgeCard(round, choice);
      if (!judged) return;
      setRound(showPick(round, choice, judged.correct));
      if (!wasAnswered(round.deck, round.shown)) void write(round, choice);
    },
    [round, write],
  );

  const next = useCallback(() => {
    setRound((previous) =>
      previous && previous.pick && !previous.saving && !previous.error
        ? { ...previous, shown: currentCard(previous.deck) ?? previous.shown, pick: null }
        : previous,
    );
  }, []);

  // A finished deck, or an abandoned round, shows the counts instead of a card.
  const over = ended || (round !== null && round.pick === null && currentCard(round.deck) === undefined);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const spot = roundTarget(event.target);
      const outcome = genderKey(event.key, {
        repeated: event.repeat || held.current.has(event.code),
        composing: event.isComposing || event.keyCode === 229,
        foreignControl: ownedByAnotherControl(event.target),
        overlayOpen: document.querySelector('[role="dialog"], [role="menu"]') !== null,
        answered: round !== null && round.pick !== null,
        choice: spot.choice,
        onRoundButton: spot.onRoundButton,
      });
      held.current.add(event.code);
      if (outcome.preventDefault) event.preventDefault();
      if (!outcome.action || !round || over) return;
      if (outcome.action === 'next') return next();
      choose(outcome.action === 'le' ? 'M' : 'F');
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
  }, [round, over, choose, next]);

  if (!round) {
    const message = status.kind === 'error' ? status.message : openError;
    return (
      <div className="rounded-lg border border-ink-200 bg-surface p-5">
        <h3 className="font-serif text-lg font-semibold text-ink-900">{t('nounGender.game.title')}</h3>
        <div className="mt-3 h-24 overflow-y-auto text-sm" aria-live="polite">
          {message === null ? (
            <p className="text-ink-600">{t('nounGender.game.saving')}</p>
          ) : (
            <p role="alert" className="break-words text-bad-700">
              {message}
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={retryOpen} disabled={message === null}>
            {t('common.retry')}
          </Button>
          <Button variant="outline" onClick={onBack}>
            {t('nounGender.game.back')}
          </Button>
        </div>
      </div>
    );
  }

  if (over) return <GenderRecap summary={summaryOf(round.deck)} onPlayAgain={start} onBack={onBack} />;

  return (
    <GenderCard
      item={round.unit.items.find((candidate) => candidate.id === round.shown)!}
      summary={summaryOf(round.deck)}
      pick={round.pick}
      saving={round.saving}
      error={round.error}
      onPick={choose}
      onNext={next}
      onRetry={() => {
        if (round.pick) void write(round, round.pick);
      }}
      onEnd={() => setEnded(true)}
    />
  );
}

interface GenderCardProps {
  item: ExerciseItem;
  summary: GenderSummary;
  pick: GenderPick | null;
  saving: boolean;
  error: string | null;
  onPick: (choice: GenderPick) => void;
  onNext: () => void;
  onRetry: () => void;
  onEnd: () => void;
}

/** One card, its reserved feedback slot and the row that never moves: both choices and Next share it. */
export function GenderCard({ item, summary, pick, saving, error, onPick, onNext, onRetry, onEnd }: GenderCardProps) {
  const { t } = useTranslation();
  const firstChoice = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const feedback = nounGenderDrillMeta(item.meta);
  // The article is the pack's answer, so it stays French data whatever the interface language is.
  const article = item.expectedAnswer === 'M' ? 'le' : 'la';
  const locked = pick !== null;
  const correct = pick !== null && pick === item.expectedAnswer;

  // A new card starts on its first choice; an answered card moves to Next, so nothing has to be reached for.
  useEffect(() => {
    if (!locked) {
      firstChoice.current?.focus({ preventScroll: true });
      return;
    }
    if (!saving && !error) nextButton.current?.focus({ preventScroll: true });
  }, [item.id, locked, saving, error]);

  return (
    <div className="rounded-lg border border-ink-200 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h3 className="font-serif text-lg font-semibold text-ink-900">{t('nounGender.game.title')}</h3>
          <p className="tnum text-xs text-ink-500">
            {t('nounGender.game.counter', { right: summary.right, total: summary.total })}
          </p>
        </div>
        <Button variant="ghost" disabled={saving || error !== null} onClick={onEnd}>
          {t('nounGender.game.endRound')}
        </Button>
      </div>
      <p lang="fr" className="mt-5 break-words text-center font-serif text-3xl font-semibold text-ink-900">
        {item.prompt}
      </p>
      <div className="mt-5 h-24 overflow-y-auto text-sm" aria-live="polite">
        {pick && (
          <>
            <p className={cn('flex items-center gap-1.5 font-medium', correct ? 'text-ok-800' : 'text-bad-700')}>
              {correct ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <X className="h-4 w-4" aria-hidden="true" />
              )}
              {t(correct ? 'nounGender.game.right' : 'nounGender.game.notQuite')}
            </p>
            <p className="mt-1 break-words">
              <span lang="fr" className="font-serif text-lg text-ink-900">
                {article} {item.prompt}
              </span>
            </p>
          </>
        )}
        {error && (
          <>
            <p role="alert" className="mt-1 break-words text-bad-700">
              {error}
            </p>
            <Button variant="outline" className="mt-2" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          </>
        )}
        {pick &&
          !error &&
          feedback?.rules.map((rule) => (
            <p key={rule.id} className="mt-1 break-words text-ink-700">
              {t('nounGender.ruleLine', {
                rule: t(`nounGender.rules.${rule.id}`),
                percent: tendencyPercent(rule.percent),
                n: rule.n,
              })}
            </p>
          ))}
        {pick && !error && feedback?.exception && (
          <p className="break-words text-ink-700">{t('nounGender.exception')}</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button
          data-gender-key
          data-gender-choice="M"
          ref={firstChoice}
          variant="outline"
          disabled={locked}
          aria-label={t('practice.genderMasculine')}
          onClick={() => onPick('M')}
        >
          <span lang="fr">{t('nounGender.game.le')}</span>
          <span aria-hidden="true" className="tnum text-xs text-ink-500">
            1
          </span>
        </Button>
        <Button
          data-gender-key
          data-gender-choice="F"
          variant="outline"
          disabled={locked}
          aria-label={t('practice.genderFeminine')}
          onClick={() => onPick('F')}
        >
          <span lang="fr">{t('nounGender.game.la')}</span>
          <span aria-hidden="true" className="tnum text-xs text-ink-500">
            2
          </span>
        </Button>
        <Button data-gender-key ref={nextButton} disabled={!locked || saving || error !== null} onClick={onNext}>
          {t('nounGender.game.next')}
        </Button>
      </div>
    </div>
  );
}

interface GenderRecapProps {
  summary: GenderSummary;
  onPlayAgain: () => void;
  onBack: () => void;
}

/** The end of a round: real counts, the guessing line, Mistakes and the way back to the reference. */
export function GenderRecap({ summary, onPlayAgain, onBack }: GenderRecapProps) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  // The card's focused control unmounts with it, so the recap takes focus itself and announces its counts.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="rounded-lg border border-ink-200 bg-surface p-5">
      <h3 ref={heading} tabIndex={-1} className="font-serif text-lg font-semibold text-ink-900">
        {t('nounGender.game.title')}
      </h3>
      <p role="status" className="tnum mt-3 break-words text-ink-800">
        {t('nounGender.game.summary', { total: summary.answered, right: summary.firstTryRight })}
      </p>
      <p className="mt-1 break-words text-sm text-ink-600">{t('nounGender.game.chance')}</p>
      <Link
        to={{ name: 'mistakes' }}
        className="mt-3 inline-flex min-h-10 items-center break-words text-sm text-accent-900 underline underline-offset-2"
      >
        {t('nounGender.game.mistakes')}
      </Link>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onPlayAgain}>{t('nounGender.game.playAgain')}</Button>
        <Button variant="outline" onClick={onBack}>
          {t('nounGender.game.back')}
        </Button>
      </div>
    </div>
  );
}
