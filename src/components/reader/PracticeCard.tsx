/** The practice card: draws `usePracticeCard` state on the ink panel; owns no recording or storage logic. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Mic,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import type { PracticeCardController } from '../../hooks/usePracticeCard';
import { takeKey } from '../../hooks/usePracticeCard';
import { useFloatingCard } from '../../hooks/useFloatingCard';
import { cancelCapture } from '../../utils/speech/recorder';
import { stopSpeech } from '../../utils/speech';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { SpeakIcon, useSpeechFailure, useSpeechPhase } from '../ui/speak-button';
import { Waveform } from './Waveform';
import { panelDanger, panelGhost, panelOutline, panelPrimary, panelSurface } from './panel';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  card: PracticeCardController;
  onOpenLog: () => void;
  /** Mouse and keyboard: the card can be dragged out of the dock. */
  movable: boolean;
}

export function PracticeCard({ card, onOpenLog, movable }: Props) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Minimised: one row (sentence, record or stop, restore, close) so more of the article shows.
  const [minimised, setMinimised] = useState(false);
  const section = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const floating = useFloatingCard(movable, section);
  const referencePhase = useSpeechPhase(card.target?.text ?? '');
  const latestPhase = useSpeechPhase(card.latest ? takeKey(card.latest) : '');
  // The real reason a reference clip could not play, on its control (recordings never fall back either).
  const referenceFailure = useSpeechFailure(card.target?.text ?? '');
  const recording = card.phase === 'recording';
  const busy = card.phase === 'acquiring' || recording || card.phase === 'saving';
  const ready = card.phase === 'ready';

  // Focus: the always-enabled close button while the microphone is requested, then Stop. Only when focus
  // is still inside the card (or nowhere), so a late permission result never pulls focus away.
  useEffect(() => {
    const inside = (el: Element | null) => !el || el === document.body || !!el.closest('[data-practice-card]');
    if (!inside(document.activeElement)) return;
    if (card.phase === 'acquiring') closeButton.current?.focus({ preventScroll: true });
    if (card.phase === 'recording') stopButton.current?.focus({ preventScroll: true });
  }, [card.phase]);

  // Local view state follows the card, adjusted during render so no stale frame shows: a new sentence
  // starts collapsed, the close confirmation only lives while a take is unsaved, and anything that needs
  // a decision opens the card again.
  const needsAttention = card.phase === 'unsaved' || !!card.error || card.notice === 'busy';
  const [seen, setSeen] = useState({ text: card.target?.text, phase: card.phase, needsAttention });
  if (seen.text !== card.target?.text || seen.phase !== card.phase || seen.needsAttention !== needsAttention) {
    setSeen({ text: card.target?.text, phase: card.phase, needsAttention });
    if (seen.text !== card.target?.text) setExpanded(false);
    if (seen.phase !== card.phase && card.phase !== 'unsaved') setConfirmClose(false);
    if (needsAttention && !seen.needsAttention) setMinimised(false);
  }

  if (card.phase === 'closed' || !card.target) return null;
  const target = card.target;

  const requestClose = () => {
    if (card.phase === 'unsaved') setConfirmClose(true);
    else card.close();
  };
  const record = () => card.open(target);
  const recordLabel = card.count ? t('practiceCard.recordAgain') : t('practiceCard.record');

  // The title doubles as the drag handle on mouse and keyboard.
  const handle = movable ? (
    <button
      type="button"
      {...floating.handleProps}
      aria-label={t('practiceCard.move')}
      title={t('practiceCard.moveHint')}
      className="h-10 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-panel-muted hover:bg-panel-raised hover:text-panel-ink cursor-grab active:cursor-grabbing touch-none select-none"
    >
      <GripVertical className="w-4 h-4" aria-hidden="true" />
      {!minimised && <span>{t('practiceCard.title')}</span>}
    </button>
  ) : minimised ? null : (
    <span className="px-3 text-xs text-panel-muted">{t('practiceCard.title')}</span>
  );
  const windowButtons = (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={panelGhost}
        aria-expanded={!minimised}
        aria-label={minimised ? t('practiceCard.restore') : t('practiceCard.minimise')}
        title={minimised ? t('practiceCard.restore') : t('practiceCard.minimise')}
        onClick={() => setMinimised(!minimised)}
      >
        {minimised ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </Button>
      <Button
        ref={closeButton}
        variant="ghost"
        size="icon"
        className={panelGhost}
        aria-label={t('common.close')}
        title={t('common.close')}
        onClick={requestClose}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </Button>
    </>
  );
  // Floating, the card keeps the dock's width.
  const shell = (extra: string) =>
    cn(panelSurface, 'font-sans text-sm', floating.floating && 'w-[min(28rem,calc(100vw-1rem))]', extra);

  if (minimised) {
    return (
      <section
        ref={section}
        data-practice-card
        aria-label={t('practiceCard.label', { sentence: target.text })}
        style={floating.style}
        className={shell('flex items-center gap-1 p-1')}
      >
        {handle}
        <p className={cn('min-w-0 flex-1 truncate font-serif text-base', !movable && 'pl-2')}>{target.text}</p>
        {recording ? (
          <>
            <Waveform source={{ kind: 'live', level: card.level }} className="h-6 w-16 shrink-0" />
            <Button
              ref={stopButton}
              size="sm"
              className={cn(panelDanger, 'tnum')}
              onClick={() => void card.stop()}
              aria-label={t('practiceCard.stop')}
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span aria-hidden="true">{clock(card.elapsedMs)}</span>
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={panelGhost}
            disabled={busy}
            onClick={record}
            aria-label={recordLabel}
            title={recordLabel}
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
          </Button>
        )}
        {windowButtons}
        {/* Saved / too short still reach screen readers while minimised. */}
        <span className="sr-only" aria-live="polite">
          {card.notice === 'saved'
            ? t('practiceCard.saved')
            : card.notice === 'tooShort'
              ? t('practiceCard.tooShort')
              : ''}
        </span>
      </section>
    );
  }

  const latest = card.latest;
  const time = latest
    ? new Date(latest.recordedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    : '';
  const status =
    card.phase === 'acquiring'
      ? t('practiceCard.acquiring')
      : card.phase === 'saving'
        ? t('practiceCard.saving')
        : card.notice === 'saved'
          ? t('practiceCard.saved')
          : card.notice === 'tooShort'
            ? t('practiceCard.tooShort')
            : card.notice === 'listeningEnded'
              ? t('practiceCard.listeningEnded')
              : null;
  // The strip's clock: the running take, else the latest take's length.
  const stripTime = recording ? clock(card.elapsedMs) : latest ? clock(Math.max(1000, latest.durationMs)) : '';

  return (
    <section
      ref={section}
      data-practice-card
      aria-label={t('practiceCard.label', { sentence: target.text })}
      style={floating.style}
      className={shell('max-h-[min(70vh,28rem)] overflow-y-auto')}
      onKeyDown={(e) => {
        // Escape is handled by the reader (sheet → card → speech); keep it from reaching other listeners twice.
        if (e.key === 'Escape' && confirmClose) {
          e.stopPropagation();
          setConfirmClose(false);
        }
      }}
    >
      <div className="flex items-center gap-1 p-1">
        {handle}
        <span className="flex-1" />
        {windowButtons}
      </div>

      {/* A long sentence shows two lines; tapping it shows the rest. */}
      <button
        type="button"
        aria-expanded={expanded}
        title={expanded ? t('practiceCard.collapse') : t('practiceCard.expand')}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'block w-full px-4 text-left font-serif text-lg leading-snug break-words cursor-pointer',
          !expanded && 'line-clamp-2',
        )}
      >
        {target.text}
      </button>

      {/* The strip: live input while recording, the latest take's real waveform afterwards. */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <Waveform
          source={
            recording
              ? { kind: 'live', level: card.level }
              : latest
                ? { kind: 'take', id: latest.id, blob: latest.blob }
                : { kind: 'none' }
          }
          className="h-10 min-w-0 flex-1"
        />
        <span className="w-10 text-right text-xs text-panel-muted tnum" aria-hidden="true">
          {stripTime}
        </span>
      </div>

      {/* Transport: reference, the record or stop button in the middle, then compare or redo. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-4">
        <Button
          variant="outline"
          className={cn(panelOutline, 'justify-self-start px-3')}
          disabled={!ready}
          onClick={() => (referencePhase === 'idle' ? card.playReference() : stopSpeech())}
          aria-label={t('practiceCard.reference')}
          title={
            referencePhase === 'idle' && referenceFailure
              ? t('speech.listenFailed', { msg: referenceFailure })
              : t('practiceCard.reference')
          }
        >
          <SpeakIcon
            phase={referencePhase}
            failed={referencePhase === 'idle' && referenceFailure !== null}
            className={cn('w-4 h-4', referencePhase === 'idle' && referenceFailure && 'text-panel-bad-ink')}
          />
          <span className="hidden sm:inline">{t('practiceCard.reference')}</span>
        </Button>
        {recording ? (
          <Button
            ref={stopButton}
            className={cn(panelDanger, 'h-12 rounded-full px-6 tnum')}
            onClick={() => void card.stop()}
          >
            <Square className="w-4 h-4 fill-current" aria-hidden="true" />
            <span>{t('practiceCard.stop')}</span>
            <span aria-hidden="true">{clock(card.elapsedMs)}</span>
          </Button>
        ) : (
          <Button
            className={cn(panelPrimary, 'h-12 rounded-full px-6')}
            disabled={busy || card.phase === 'unsaved'}
            onClick={record}
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            <span>{recordLabel}</span>
          </Button>
        )}
        {recording ? (
          <Button
            variant="outline"
            className={cn(panelOutline, 'justify-self-end px-3')}
            onClick={card.redo}
            aria-label={t('practiceCard.redo')}
            title={t('practiceCard.redo')}
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('practiceCard.redo')}</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            className={cn(panelOutline, 'justify-self-end px-3')}
            disabled={!ready || !latest}
            onClick={card.compare}
            aria-label={t('practiceCard.compare')}
            title={t('practiceCard.compareTitle')}
          >
            <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('practiceCard.compare')}</span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 min-h-12 border-t border-panel-line">
        {latest ? (
          <Button
            variant="ghost"
            size="sm"
            className={panelGhost}
            disabled={!ready}
            aria-label={t('practiceCard.playLatest', { time })}
            onClick={() => (latestPhase === 'idle' ? card.playLatest() : stopSpeech())}
          >
            <SpeakIcon phase={latestPhase} className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-panel-muted">{t('practiceCard.latest')}</span>
            <span className="tnum">
              {time} · {clock(Math.max(1000, latest.durationMs))}
            </span>
          </Button>
        ) : (
          <span className="px-2 text-xs text-panel-muted">{t('practiceCard.noTakes')}</span>
        )}
        {card.count > 0 && (
          <button
            type="button"
            onClick={onOpenLog}
            className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs text-panel-link hover:bg-panel-raised cursor-pointer"
          >
            <span>{t('practiceCard.allRecordings', { count: card.count })}</span>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Hint, status or error: one bounded line region, announced on change. */}
      <div
        aria-live="polite"
        className="px-4 py-2 min-h-10 max-h-24 overflow-y-auto border-t border-panel-line text-xs"
      >
        {confirmClose ? (
          <p className="flex flex-wrap items-center gap-2">
            <span>{t('practiceCard.confirmDiscard')}</span>
            <Button
              variant="outline"
              size="sm"
              className={panelOutline}
              onClick={() => {
                card.discardUnsaved();
                card.close();
              }}
            >
              {t('practiceCard.discard')}
            </Button>
            <Button variant="ghost" size="sm" className={panelGhost} onClick={() => setConfirmClose(false)}>
              {t('practiceCard.keep')}
            </Button>
          </p>
        ) : card.phase === 'unsaved' ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-panel-bad-ink">
            <span className="break-words">{t('practiceCard.saveFailed', { msg: card.error })}</span>
            <Button variant="outline" size="sm" className={panelOutline} onClick={card.retrySave}>
              {t('practiceCard.retry')}
            </Button>
            <Button variant="ghost" size="sm" className={panelGhost} onClick={card.discardUnsaved}>
              {t('practiceCard.discard')}
            </Button>
          </p>
        ) : card.notice === 'busy' ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-panel-bad-ink">
            <span>{t('practiceCard.busy')}</span>
            <Button variant="outline" size="sm" className={panelOutline} onClick={cancelCapture}>
              {t('shadowing.stopOther')}
            </Button>
          </p>
        ) : card.error ? (
          <p role="alert" className="text-panel-bad-ink break-words">
            {t('practiceCard.error', { msg: card.error })}
          </p>
        ) : (
          <p className="text-panel-muted">{status ?? t('practiceCard.hint')}</p>
        )}
      </div>
    </section>
  );
}
