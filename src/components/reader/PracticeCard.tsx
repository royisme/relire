/** The docked practice card: draws `usePracticeCard` state; owns no recording or storage logic. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ChevronDown, Mic, RotateCcw, Square, X } from 'lucide-react';
import type { PracticeCardController } from '../../hooks/usePracticeCard';
import { takeKey } from '../../hooks/usePracticeCard';
import { cancelCapture } from '../../utils/speech/recorder';
import { stopSpeech } from '../../utils/speech';
import { Button } from '../ui/button';
import { SpeakIcon, useSpeechPhase } from '../ui/speak-button';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const BARS = 7;

interface Props {
  card: PracticeCardController;
  onOpenLog: () => void;
}

export function PracticeCard({ card, onOpenLog }: Props) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const referencePhase = useSpeechPhase(card.target?.text ?? '');
  const latestPhase = useSpeechPhase(card.latest ? takeKey(card.latest) : '');
  const recording = card.phase === 'recording';
  const busy = card.phase === 'acquiring' || recording || card.phase === 'saving';

  // Focus: the always-enabled close button while the microphone is requested, then Stop. Only when focus
  // is still inside the card (or nowhere), so a late permission result never pulls focus away.
  useEffect(() => {
    const inside = (el: Element | null) => !el || el === document.body || !!el.closest('[data-practice-card]');
    if (!inside(document.activeElement)) return;
    if (card.phase === 'acquiring') closeButton.current?.focus({ preventScroll: true });
    if (card.phase === 'recording') stopButton.current?.focus({ preventScroll: true });
  }, [card.phase]);

  useEffect(() => setExpanded(false), [card.target?.text]);
  useEffect(() => {
    if (card.phase !== 'unsaved') setConfirmClose(false);
  }, [card.phase]);

  // The level meter moves bar heights directly on animation frames; React does not re-render for it.
  useEffect(() => {
    if (!recording) return;
    let frame = 0;
    const draw = () => {
      const level = card.level();
      bars.current.forEach((bar, index) => {
        if (!bar) return;
        const shape = 0.45 + 0.55 * Math.sin(((index + 1) / (BARS + 1)) * Math.PI);
        bar.style.transform = `scaleY(${Math.max(0.12, level * shape)})`;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [recording, card]);

  if (card.phase === 'closed' || !card.target) return null;

  const requestClose = () => {
    if (card.phase === 'unsaved') setConfirmClose(true);
    else card.close();
  };

  const time = card.latest ? new Date(card.latest.recordedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) : '';
  const status =
    card.phase === 'acquiring' ? t('practiceCard.acquiring')
    : card.phase === 'saving' ? t('practiceCard.saving')
    : card.notice === 'saved' ? t('practiceCard.saved')
    : card.notice === 'tooShort' ? t('practiceCard.tooShort')
    : card.notice === 'listeningEnded' ? t('practiceCard.listeningEnded')
    : null;

  return (
    <section
      data-practice-card
      aria-label={t('practiceCard.label', { sentence: card.target.text })}
      className="pointer-events-auto rounded-lg border border-ink-300 bg-surface shadow-lg font-sans text-sm text-ink-800 max-h-[min(45vh,22rem)] overflow-y-auto"
      onKeyDown={(e) => {
        // Escape is handled by the reader (sheet → card → speech); keep it from reaching other listeners twice.
        if (e.key === 'Escape' && confirmClose) {
          e.stopPropagation();
          setConfirmClose(false);
        }
      }}
    >
      <div className="flex items-start gap-1 px-3 pt-2">
        <p className={`min-w-0 flex-1 py-1.5 font-serif text-base text-ink-900 break-words ${expanded ? '' : 'line-clamp-2'}`}>
          {card.target.text}
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-expanded={expanded}
          aria-label={expanded ? t('practiceCard.collapse') : t('practiceCard.expand')}
          title={expanded ? t('practiceCard.collapse') : t('practiceCard.expand')}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </Button>
        <Button ref={closeButton} variant="ghost" size="icon" aria-label={t('common.close')} title={t('common.close')} onClick={requestClose}>
          <X className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Controls: the slot keeps its height in every phase; buttons wrap on narrow screens. */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 min-h-14">
        <Button
          variant="outline"
          disabled={card.phase !== 'ready'}
          onClick={() => (referencePhase === 'idle' ? card.playReference() : stopSpeech())}
          className="whitespace-normal"
        >
          <SpeakIcon phase={referencePhase} className="w-4 h-4" />
          <span>{t('practiceCard.reference')}</span>
        </Button>
        {recording ? (
          <>
            <Button ref={stopButton} variant="destructive" onClick={() => void card.stop()} className="whitespace-normal">
              <Square className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>{t('practiceCard.stop')}</span>
              <span className="tnum" aria-hidden="true">{clock(card.elapsedMs)}</span>
            </Button>
            <Button variant="outline" onClick={card.redo} className="whitespace-normal">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>{t('practiceCard.redo')}</span>
            </Button>
            <span className="inline-flex h-6 items-center gap-0.5" aria-hidden="true">
              {Array.from({ length: BARS }, (_, index) => (
                <span key={index} ref={(el) => { bars.current[index] = el; }} className="h-6 w-1 rounded-full bg-accent-600 origin-center scale-y-[0.12]" />
              ))}
            </span>
          </>
        ) : (
          <Button disabled={busy || card.phase === 'unsaved'} onClick={() => card.target && card.open(card.target)} className="whitespace-normal">
            <Mic className="w-4 h-4" aria-hidden="true" />
            <span>{card.count ? t('practiceCard.recordAgain') : t('practiceCard.record')}</span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 min-h-10 border-t border-ink-200">
        {card.latest ? (
          <>
            <span className="text-xs text-ink-600">{t('practiceCard.latest')}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={card.phase !== 'ready'}
              aria-label={t('practiceCard.playLatest', { time })}
              onClick={() => (latestPhase === 'idle' ? card.playLatest() : stopSpeech())}
            >
              <SpeakIcon phase={latestPhase} className="w-3.5 h-3.5" />
              <span className="tnum">{time} · {clock(Math.max(1000, card.latest.durationMs))}</span>
            </Button>
            <Button variant="ghost" size="sm" disabled={card.phase !== 'ready'} onClick={card.compare} title={t('practiceCard.compareTitle')}>
              <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('practiceCard.compare')}</span>
            </Button>
          </>
        ) : (
          <span className="text-xs text-ink-600">{t('practiceCard.noTakes')}</span>
        )}
        {card.count > 0 && (
          <button type="button" onClick={onOpenLog} className="ml-auto min-h-10 text-xs text-accent-900 underline underline-offset-2 cursor-pointer">
            {t('practiceCard.allRecordings', { count: card.count })}
          </button>
        )}
      </div>

      {/* Hint, status or error: one bounded line region, announced on change. */}
      <div aria-live="polite" className="px-3 py-2 min-h-10 max-h-24 overflow-y-auto border-t border-ink-200 text-xs">
        {confirmClose ? (
          <p className="flex flex-wrap items-center gap-2 text-ink-800">
            <span>{t('practiceCard.confirmDiscard')}</span>
            <Button variant="outline" size="sm" onClick={() => { card.discardUnsaved(); card.close(); }}>{t('practiceCard.discard')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)}>{t('practiceCard.keep')}</Button>
          </p>
        ) : card.phase === 'unsaved' ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-bad-700">
            <span className="break-words">{t('practiceCard.saveFailed', { msg: card.error })}</span>
            <Button variant="outline" size="sm" onClick={card.retrySave}>{t('practiceCard.retry')}</Button>
            <Button variant="ghost" size="sm" onClick={card.discardUnsaved}>{t('practiceCard.discard')}</Button>
          </p>
        ) : card.notice === 'busy' ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-bad-700">
            <span>{t('practiceCard.busy')}</span>
            <Button variant="outline" size="sm" onClick={cancelCapture}>{t('shadowing.stopOther')}</Button>
          </p>
        ) : card.error ? (
          <p role="alert" className="text-bad-700 break-words">{t('practiceCard.error', { msg: card.error })}</p>
        ) : (
          <p className="text-ink-600">{status ?? t('practiceCard.hint')}</p>
        )}
      </div>
    </section>
  );
}
