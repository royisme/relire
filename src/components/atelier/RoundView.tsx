/**
 * One round of the sentence workshop in Build mode, laid out as a game for the thumb: the HUD, the order
 * ticket, the baseplate, the bin, and one big button at the bottom (Check, then Next). The breakdown rises as
 * a booklet page once the sentence is right or shown. Owns the keyboard, focus, the cues, the flights and
 * the check call; each verdict and reveal is reported through `onRecord` for the screen to persist. The state
 * is `services/atelier/roundState`; the AI calls come in through `source`.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../services/ai/errors';
import { joinBricks } from '../../services/atelier/join';
import { lightingPlan } from '../../services/atelier/links';
import {
  currentTurn,
  isOver,
  prepareCheck,
  roundReducer,
  rowText,
  startRound,
  summaryOf,
  turnOutcome,
  type Turn,
} from '../../services/atelier/roundState';
import type { AtelierSource, RoundChoice } from '../../services/atelier/source';
import type { AtelierItem } from '../../types/atelier';
import { playCue, type Cue } from '../../utils/gameCues';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { Baseplate } from './Baseplate';
import { Bin } from './Bin';
import { Booklet } from './Booklet';
import { Hud, type Pip } from './Hud';
import { Slip } from './Slip';
import { useMotion } from './Stage';
import { Summary } from './Summary';
import { Ticket } from './Ticket';

interface RoundViewProps {
  items: AtelierItem[];
  choice: RoundChoice;
  /** Items the boundary check dropped, said once at the top of the round. */
  dropped: number;
  source: AtelierSource;
  /** Starts the next round of `choice` in the background, called once the second-to-last turn is reached. */
  onPrefetch: (choice: RoundChoice) => void;
  /** Persists the one record an item gets: every verdict, and a reveal counted wrong. */
  onRecord: (itemIndex: number, answer: string, correct: boolean) => void;
  onAgain: () => void;
  onThemes: () => void;
  onLeave: () => void;
}

const CUE_OF_EVENT: Record<string, Cue | undefined> = {
  snap: 'snap',
  fuse: 'fuse',
  reject: 'wrong',
  wrong: 'wrong',
  finish: 'finish',
};

/** The cue lands with the brick: after the flight, or after the halves of a fusion meet. */
const CUE_DELAY: Record<string, number | undefined> = { snap: 160, reject: 130, fuse: 250 };

export function RoundView({
  items,
  choice,
  dropped,
  source,
  onPrefetch,
  onRecord,
  onAgain,
  onThemes,
  onLeave,
}: RoundViewProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const [state, dispatch] = useReducer(roundReducer, items, startRound);
  const [showOther, setShowOther] = useState(false);
  /** Where the brick that just moved was on screen, so it can fly to its place. */
  const [origin, setOrigin] = useState<DOMRect>();
  /** The turn whose booklet page is open; it opens from Breakdown. */
  const [openFor, setOpenFor] = useState<number | null>(null);
  const motion = useMotion();
  const over = isOver(state);
  const turn = over ? undefined : currentTurn(state);
  const item = turn ? state.items[turn.itemIndex] : undefined;

  const trayButtons = useRef(new Map<string, HTMLButtonElement>());
  const primary = useRef<HTMLButtonElement>(null);
  const focusHint = useRef<string | null>(null);
  const register = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) trayButtons.current.set(id, element);
    else trayButtons.current.delete(id);
  }, []);
  const firstFree = (t: Turn) => t.pieces.find((piece) => !t.placed.includes(piece.id))?.id;

  // The cue follows the event, not the key, so it stays in step with what the round did.
  useEffect(() => {
    const cue = state.event && CUE_OF_EVENT[state.event.kind];
    if (!cue || !state.event) return;
    const delay = motion ? (CUE_DELAY[state.event.kind] ?? 0) : 0;
    window.setTimeout(() => playCue(cue), delay);
    // Only a new event plays a cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.event]);

  // A right row lights up as a circuit: a note climbs with each line that lands and the chord comes when the row
  // settles, the same moments the lines draw at. Next ends it early, so a stale note never sounds in the next sentence.
  useEffect(() => {
    if (state.event?.kind !== 'right' || !item) return;
    const plan = lightingPlan(item.links.length);
    const ids = motion
      ? [
          ...item.links.map((_, step) => window.setTimeout(() => playCue('link', step), plan.arrive(step))),
          window.setTimeout(() => playCue('right'), plan.total),
        ]
      : [window.setTimeout(() => playCue('right'), 0)];
    return () => ids.forEach((id) => window.clearTimeout(id));
    // Only a new event plays a cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.event]);

  // A new sentence starts on its first free brick.
  useEffect(() => {
    if (!turn) return;
    const first = firstFree(turn);
    if (first) trayButtons.current.get(first)?.focus({ preventScroll: true });
    // Only the turn changing moves focus here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current]);

  // The second-to-last turn starts the next round in the background, so "Play again" never waits for it.
  // `state` itself is not a dependency: every dispatch makes a new one, and only these two numbers matter.
  useEffect(() => {
    if (state.current === state.turns.length - 2) onPrefetch(choice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current, state.turns.length, choice, onPrefetch]);

  // A brick that left the bin took the focus with it; the next one (or the taken-back one) receives it.
  useEffect(() => {
    if (!turn || turn.right) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const hinted = focusHint.current ? trayButtons.current.get(focusHint.current) : undefined;
    const target = hinted ?? trayButtons.current.get(firstFree(turn) ?? '') ?? primary.current;
    target?.focus({ preventScroll: true });
    // Only the row changing moves focus here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.placed]);

  // Right: the big button becomes Next and takes the focus; the lit sentence stays in view, and the
  // booklet opens only from Breakdown.
  useEffect(() => {
    if (turn?.right) primary.current?.focus({ preventScroll: true });
  }, [turn?.right, state.current]);

  if (over || !turn || !item) {
    return (
      <Summary
        summary={summaryOf(state)}
        pips={state.turns.filter((done) => done.right).map(turnOutcome)}
        onAgain={onAgain}
        onThemes={onThemes}
        onLeave={onLeave}
      />
    );
  }

  const rectOf = (pieceId: string) => document.querySelector(`[data-brick="${pieceId}"]`)?.getBoundingClientRect();
  const place = (pieceId: string) => {
    const free = turn.pieces.filter((piece) => !turn.placed.includes(piece.id));
    const at = free.findIndex((piece) => piece.id === pieceId);
    focusHint.current = (free[at + 1] ?? free[at - 1])?.id ?? null;
    setOrigin(rectOf(pieceId));
    dispatch({ type: 'place', pieceId });
  };
  const remove = (pieceId: string) => {
    focusHint.current = pieceId;
    setOrigin(rectOf(pieceId));
    dispatch({ type: 'remove', pieceId });
  };

  const check = async () => {
    if (turn.pending || turn.right || turn.placed.length === 0) return;
    const checked = prepareCheck(state, choice);
    if (checked.kind === 'verdict') {
      dispatch({ type: 'checked', answer: checked.answer, correct: checked.correct, feedback: null });
      onRecord(turn.itemIndex, checked.answer, checked.correct);
      return;
    }
    dispatch({ type: 'pending' });
    try {
      const result = await source.grade(item, checked.answer);
      dispatch({ type: 'checked', answer: checked.answer, correct: result.isCorrect, feedback: result.feedback });
      onRecord(turn.itemIndex, checked.answer, result.isCorrect);
    } catch (error) {
      dispatch({ type: 'failed', message: errorMessage(error) });
    }
  };

  const lastTurn = state.current === state.turns.length - 1;
  const sheetOpen = turn.right && openFor === state.current;
  const pips: Pip[] = state.turns.map((candidate, index) =>
    index < state.current ? turnOutcome(candidate) : index === state.current ? 'current' : 'todo',
  );
  const progress = turn.retry
    ? t('atelier.round.again')
    : t('atelier.round.counter', { current: state.current + 1, total: items.length });

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (event.key !== 'Backspace' || event.repeat || event.nativeEvent.isComposing) return;
        event.preventDefault();
        dispatch({ type: 'removeLast' });
      }}
    >
      <Hud onExit={() => dispatch({ type: 'end' })} pips={pips} progress={progress} />
      {dropped > 0 && (
        <p className="px-4 pb-1 text-xs text-ink-600">{t('atelier.round.skipped', { count: dropped })}</p>
      )}
      <div inert={sheetOpen} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Ticket
            meaning={item.meaning}
            language={language}
            showOther={showOther}
            onToggleOther={() => setShowOther(!showOther)}
          />
          <div className="mx-3 flex flex-1 flex-col pb-2">
            <Baseplate
              turn={turn}
              size={item.bricks.length}
              links={item.links}
              event={state.event}
              motion={motion}
              origin={origin}
              onRemove={remove}
            >
              <Slip turn={turn} language={language} total={item.bricks.length} />
            </Baseplate>
          </div>
        </div>
        <div className="mx-3 mt-2 mb-3 shrink-0">
          <Bin
            turn={turn}
            event={state.event}
            motion={motion}
            disabled={turn.pending || turn.right}
            closed={turn.right}
            origin={origin}
            register={register}
            onPlace={place}
          />
        </div>
        <footer className="shrink-0 px-3 pb-3">
          <div className="mb-2 flex items-center justify-between">
            <SpeakButton
              text={turn.right ? rowText(turn) : joinBricks(item.bricks)}
              variant="ghost"
              showLabel
              disabled={!turn.right}
              label={t('atelier.round.listen')}
              stopLabel={t('atelier.round.stop')}
            />
            {turn.right ? (
              <Button variant="ghost" onClick={() => setOpenFor(state.current)}>
                {t('atelier.round.breakdown')}
              </Button>
            ) : (
              <Button
                variant="ghost"
                disabled={turn.pending}
                onClick={() => {
                  // The row as it stands is what a reveal with no check behind it is recorded with.
                  onRecord(turn.itemIndex, rowText(turn), false);
                  dispatch({ type: 'reveal' });
                }}
              >
                {t('atelier.round.showAnswer')}
              </Button>
            )}
          </div>
          <Button
            ref={primary}
            className="game-cta"
            disabled={!turn.right && turn.placed.length === 0}
            aria-disabled={turn.pending || undefined}
            aria-busy={turn.pending}
            onKeyDown={(event) => {
              // A held Enter must not check and then advance.
              if (event.repeat) event.preventDefault();
            }}
            onClick={() => (turn.right ? dispatch({ type: 'next' }) : void check())}
          >
            {turn.pending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
            {turn.right ? t(lastTurn ? 'atelier.round.results' : 'atelier.round.next') : t('atelier.round.check')}
          </Button>
        </footer>
      </div>
      {sheetOpen && (
        <Booklet
          item={item}
          turn={turn}
          language={language}
          lastTurn={lastTurn}
          onClose={() => {
            setOpenFor(null);
            requestAnimationFrame(() => primary.current?.focus({ preventScroll: true }));
          }}
          onNext={() => dispatch({ type: 'next' })}
        />
      )}
    </div>
  );
}
