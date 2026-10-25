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

/**
 * The round's key, or null when the keydown belongs to someone else: a repeating or held key, an IME
 * composition, or a field, link, other button or open dialog that owns its own keys. Once the card is
 * answered its answer keys are inert, except the right arrow, which advances with Enter and Space.
 */
export function genderKey(
  key: string,
  facts: { repeated: boolean; composing: boolean; foreignControl: boolean; answered: boolean },
): GenderKeyAction | null {
  if (facts.repeated || facts.composing || facts.foreignControl) return null;
  if (key === 'Enter' || key === ' ') return 'next';
  const pick = key === '1' || key === 'ArrowLeft' ? 'le' : key === '2' || key === 'ArrowRight' ? 'la' : null;
  if (!pick) return null;
  if (facts.answered) return pick === 'la' ? 'next' : null;
  return pick;
}

/** True when focus is in a control that owns its keys; the round's own buttons are marked, so they do not count. */
function ownedByAnotherControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest('[data-gender-key]')) return false;
  return (
    target.closest('input, textarea, select, [contenteditable="true"], a, button, [role="dialog"], [role="menu"]') !==
    null
  );
}

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

  /** Saves one round's unit and opens its deck; a replaced or unmounted round drops the result. */
  const openRound = async () => {
    const id = ++session.current;
    const units = await save(() => prepareGenderDrills({ pack, count: ROUND_SIZE, t }));
    if (!units) return;
    const [unit] = units;
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

  /** A round from a button: the old card and its errors go at once, then the new unit is saved. */
  const start = () => {
    setRound(null);
    setEnded(false);
    setOpenError(null);
    void openRound();
  };

  // One round per mount. A second round is the Play again button, never a re-render of this effect.
  useEffect(() => {
    const game = session;
    void openRound();
    return () => {
      game.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Writes the first answer of the card on screen: the one write each card gets. A returning card writes nothing. */
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
      if (session.current === id) setRound((previous) => (previous ? { ...previous, saving: false } : previous));
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
      const first = !wasAnswered(round.deck, round.shown);
      setRound({
        ...round,
        deck: answerCard(round.deck, round.shown, judged.correct),
        pick: choice,
        saving: first,
        error: null,
      });
      if (first) void write(round, choice);
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
    const held = new Set<string>();
    const keydown = (event: KeyboardEvent) => {
      const action = genderKey(event.key, {
        repeated: event.repeat || held.has(event.code),
        composing: event.isComposing || event.keyCode === 229,
        foreignControl: ownedByAnotherControl(event.target),
        answered: round !== null && round.pick !== null,
      });
      held.add(event.code);
      if (!action || !round || over) return;
      event.preventDefault();
      if (action === 'next') return next();
      choose(action === 'le' ? 'M' : 'F');
    };
    const keyup = (event: KeyboardEvent) => held.delete(event.code);
    const blur = () => held.clear();
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
          <Button onClick={start} disabled={message === null}>
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
        <Button variant="ghost" size="sm" onClick={onEnd}>
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
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
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
  return (
    <div className="rounded-lg border border-ink-200 bg-surface p-5">
      <h3 className="font-serif text-lg font-semibold text-ink-900">{t('nounGender.game.title')}</h3>
      <p className="tnum mt-3 break-words text-ink-800">
        {t('nounGender.game.summary', { total: summary.answered, right: summary.firstTryRight })}
      </p>
      <p className="mt-1 break-words text-sm text-ink-600">{t('nounGender.game.chance')}</p>
      <Link
        to={{ name: 'study', tab: 'mistakes' }}
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
