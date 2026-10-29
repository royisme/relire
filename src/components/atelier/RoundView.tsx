/**
 * One round of the sentence workshop in Build mode: the meaning, the build
 * row, a fixed status slot, the three permanent actions (Check, Listen, Next)
 * and below them the tray, which becomes the breakdown once the sentence is
 * right. Owns the keyboard, focus, the cues and the check call. The state is
 * `services/atelier/roundState`; the AI calls come in through `source`.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Check, Languages, Loader2, X, Volume2, VolumeX, Zap, ZapOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { errorMessage } from '../../services/ai/errors';
import { joinBricks } from '../../services/atelier/join';
import {
  currentTurn,
  isOver,
  prepareCheck,
  roundReducer,
  rowText,
  startRound,
  summaryOf,
  type Turn,
} from '../../services/atelier/roundState';
import type { AtelierSource, RoundChoice } from '../../services/atelier/source';
import type { AtelierItem } from '../../types/atelier';
import { playCue, setGameEffects, setGameSound, useGameSwitches, type Cue } from '../../utils/gameCues';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { Breakdown } from './Breakdown';
import { BuildRow, Tray } from './BuildRow';
import { Summary } from './Summary';

interface RoundViewProps {
  items: AtelierItem[];
  choice: RoundChoice;
  /** Items the boundary check dropped, said once at the top of the round. */
  dropped: number;
  source: AtelierSource;
  onAgain: () => void;
  onThemes: () => void;
}

const CUE_OF_EVENT: Record<string, Cue | undefined> = {
  snap: 'snap',
  fuse: 'fuse',
  wrong: 'wrong',
  right: 'right',
  finish: 'finish',
};

/** The one line under the row: why a brick is wrong, what fused, the verdict, or the real error. */
function Status({ turn, language }: { turn: Turn; language: 'zh' | 'en' }) {
  const { t } = useTranslation();
  const pieceOf = (id: string) => turn.pieces.find((piece) => piece.id === id)!;
  const { note } = turn;
  const reasonOf = (id: string) => {
    const piece = pieceOf(id);
    return (
      <p key={id} className="break-words">
        {piece.reason![language]}
      </p>
    );
  };
  if (turn.right)
    return (
      <p className="flex items-center gap-1.5 font-medium text-ok-800">
        <Check className="h-4 w-4" aria-hidden="true" />
        {t('atelier.round.right')}
      </p>
    );
  if (!note) return null;
  if (note.kind === 'distractor')
    return (
      <div className="flex gap-1.5 text-bad-700">
        <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {reasonOf(note.pieceId)}
      </div>
    );
  if (note.kind === 'fused')
    return (
      <p className="break-words text-ink-800">
        {t('atelier.round.fused', { a: note.parts[0], b: note.parts[1], fused: note.into })}
      </p>
    );
  if (note.kind === 'error')
    return (
      <p role="alert" className="break-words text-bad-700">
        {t('atelier.round.gradeFailed', { msg: note.message })}
      </p>
    );
  const flagged = turn.placed.filter((id) => pieceOf(id).reason);
  return (
    <div className="flex gap-1.5 text-bad-700">
      <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {note.feedback ? (
          <p className="break-words">{note.feedback}</p>
        ) : flagged.length > 0 ? (
          <>
            <p>{t('atelier.round.flagged')}</p>
            {flagged.map(reasonOf)}
          </>
        ) : (
          <p>{t('atelier.round.notQuite')}</p>
        )}
      </div>
    </div>
  );
}

export function RoundView({ items, choice, dropped, source, onAgain, onThemes }: RoundViewProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const other = language === 'zh' ? 'en' : 'zh';
  const [state, dispatch] = useReducer(roundReducer, items, startRound);
  const [showOther, setShowOther] = useState(false);
  const switches = useGameSwitches();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const motion = switches.effects && !reduced;
  const over = isOver(state);
  const turn = over ? undefined : currentTurn(state);
  const item = turn ? state.items[turn.itemIndex] : undefined;

  const trayButtons = useRef(new Map<string, HTMLButtonElement>());
  const checkButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusHint = useRef<string | null>(null);
  const register = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) trayButtons.current.set(id, element);
    else trayButtons.current.delete(id);
  }, []);
  const firstFree = (t: Turn) => t.pieces.find((piece) => !t.placed.includes(piece.id))?.id;

  // The cue follows the event, not the key, so it stays in step with what the round did.
  useEffect(() => {
    const cue = state.event && CUE_OF_EVENT[state.event.kind];
    if (cue) playCue(cue);
  }, [state.event]);

  // A new sentence starts on its first free brick.
  useEffect(() => {
    if (!turn) return;
    const first = firstFree(turn);
    if (first) trayButtons.current.get(first)?.focus({ preventScroll: true });
    // Only the turn changing moves focus here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current]);

  // A brick that left the tray took the focus with it; the next one (or the taken-back one) receives it.
  useEffect(() => {
    if (!turn || turn.right) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const hinted = focusHint.current ? trayButtons.current.get(focusHint.current) : undefined;
    const target = hinted ?? trayButtons.current.get(firstFree(turn) ?? '') ?? checkButton.current;
    target?.focus({ preventScroll: true });
    // Only the row changing moves focus here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.placed]);

  // Right: Next is where the keys go.
  useEffect(() => {
    if (turn?.right) nextButton.current?.focus({ preventScroll: true });
  }, [turn?.right]);

  if (over || !turn || !item) {
    return <Summary summary={summaryOf(state)} onAgain={onAgain} onThemes={onThemes} />;
  }

  const place = (pieceId: string) => {
    const free = turn.pieces.filter((piece) => !turn.placed.includes(piece.id));
    const at = free.findIndex((piece) => piece.id === pieceId);
    focusHint.current = (free[at + 1] ?? free[at - 1])?.id ?? null;
    dispatch({ type: 'place', pieceId });
  };
  const remove = (pieceId: string) => {
    focusHint.current = pieceId;
    dispatch({ type: 'remove', pieceId });
  };

  const check = async () => {
    if (turn.pending || turn.right || turn.placed.length === 0) return;
    const checked = prepareCheck(state, choice);
    if (checked.kind === 'verdict') {
      dispatch({ type: 'checked', answer: checked.answer, correct: checked.correct, feedback: null });
      return;
    }
    dispatch({ type: 'pending' });
    try {
      const result = await source.grade(item, checked.answer);
      dispatch({ type: 'checked', answer: checked.answer, correct: result.isCorrect, feedback: result.feedback });
    } catch (error) {
      dispatch({ type: 'failed', message: errorMessage(error) });
    }
  };

  const lastTurn = state.current === state.turns.length - 1;
  const heldKey = (event: React.KeyboardEvent) => {
    // A held Enter must not check and then advance.
    if (event.repeat) event.preventDefault();
  };

  return (
    <div
      className="rounded-lg border border-ink-200 bg-surface p-4 sm:p-5"
      onKeyDown={(event) => {
        if (event.key !== 'Backspace' || event.repeat || event.nativeEvent.isComposing) return;
        event.preventDefault();
        dispatch({ type: 'removeLast' });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h3 className="font-serif text-lg font-semibold text-ink-900">{t('atelier.title')}</h3>
          <p className="tnum text-xs text-ink-500">
            {turn.retry
              ? t('atelier.round.again')
              : t('atelier.round.counter', { current: state.current + 1, total: items.length })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={switches.sound}
            aria-label={t('atelier.round.sound')}
            title={t('atelier.round.sound')}
            onClick={() => setGameSound(!switches.sound)}
          >
            {switches.sound ? (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={switches.effects}
            aria-label={t('atelier.round.effects')}
            title={t('atelier.round.effects')}
            onClick={() => setGameEffects(!switches.effects)}
          >
            {switches.effects ? (
              <Zap className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ZapOff className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <Button variant="ghost" onClick={() => dispatch({ type: 'end' })}>
            {t('atelier.round.endRound')}
          </Button>
        </div>
      </div>
      {dropped > 0 && <p className="mt-1 text-xs text-ink-500">{t('atelier.round.skipped', { count: dropped })}</p>}

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-h-[4.75rem] min-w-0">
          <p lang={language} className="break-words font-serif text-xl text-ink-900">
            {item.meaning[language]}
          </p>
          <p lang={other} className="mt-1 min-h-6 break-words text-sm text-ink-600">
            {showOther ? item.meaning[other] : null}
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-pressed={showOther} onClick={() => setShowOther(!showOther)}>
          <Languages className="h-4 w-4" aria-hidden="true" />
          {t(other === 'zh' ? 'atelier.round.langZh' : 'atelier.round.langEn')}
        </Button>
      </div>

      <div className="mt-3">
        <BuildRow turn={turn} event={state.event} motion={motion} onRemove={remove} />
      </div>
      <div className="mt-3 h-20 overflow-y-auto text-sm" aria-live="polite">
        <Status turn={turn} language={language} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          ref={checkButton}
          variant={turn.right ? 'outline' : 'default'}
          className="min-w-20 px-3"
          disabled={turn.right || turn.placed.length === 0}
          aria-disabled={turn.pending || undefined}
          aria-busy={turn.pending}
          onKeyDown={heldKey}
          onClick={() => void check()}
        >
          {turn.pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {t('atelier.round.check')}
        </Button>
        <SpeakButton
          text={turn.right ? rowText(turn) : joinBricks(item.bricks)}
          variant="outline"
          showLabel
          disabled={!turn.right}
          label={t('atelier.round.listen')}
          stopLabel={t('atelier.round.stop')}
        />
        <Button
          ref={nextButton}
          variant={turn.right ? 'default' : 'outline'}
          className="min-w-20 px-3"
          disabled={!turn.right}
          onKeyDown={heldKey}
          onClick={() => dispatch({ type: 'next' })}
        >
          {t(lastTurn ? 'atelier.round.results' : 'atelier.round.next')}
        </Button>
      </div>

      <div className="mt-5 border-t border-ink-200 pt-4">
        {turn.right ? (
          <Breakdown item={item} turn={turn} language={language} />
        ) : (
          <Tray turn={turn} motion={motion} disabled={turn.pending} register={register} onPlace={place} />
        )}
      </div>
    </div>
  );
}
