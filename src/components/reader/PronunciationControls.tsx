/** Floating pronunciation controls. Generation/status never add rows to the reading column. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, X } from 'lucide-react';
import type { PronunciationController } from '../../hooks/usePronunciationMarkers';
import type { PronunciationLayers } from '../../types/pronunciation';
import { Button } from '../ui/button';

interface Props {
  controller: PronunciationController;
  onDisplay: () => void;
  onMode: (marked: boolean) => void;
  onOpen: () => void;
}
const layerNames: (keyof PronunciationLayers)[] = ['connections', 'stress', 'silent', 'syllables'];

export function PronunciationControls({ controller: c, onDisplay, onMode, onOpen }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const details = Object.entries(c.displayed).flatMap(([id, markers]) => markers.connections.map((connection, index) => ({
    key: `${id}-${index}`,
    left: markers.words[connection.left].source,
    right: markers.words[connection.right].source,
    type: t(`prosody.${connection.type}`),
    sound: connection.sound,
  })));

  return (
    <div ref={root} className="contents">
      <Button
        ref={trigger}
        variant="outline"
        size="icon"
        data-pronunciation-trigger
        aria-label={t('prosody.title')}
        title={t('prosody.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen();
          setOpen(!open);
        }}
      ><AudioLines className="w-4 h-4" aria-hidden="true" /></Button>
      {open && (
        <div
          role="dialog"
          aria-label={t('prosody.title')}
          data-pronunciation-panel
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(70vh,38rem)] overflow-y-auto rounded-lg border border-ink-200 bg-surface p-4 shadow-lg space-y-3 text-sm font-sans text-ink-800"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif font-semibold text-base text-ink-900">{t('prosody.title')}</h2>
            <Button ref={closeButton} variant="ghost" size="icon" aria-label={t('common.close')} onClick={() => {
              setOpen(false);
              trigger.current?.focus({ preventScroll: true });
            }}><X className="w-4 h-4" aria-hidden="true" /></Button>
          </div>
          <p className="text-xs text-ink-600 leading-relaxed">{t('prosody.disclosure')}</p>
          <p className="text-xs text-ink-600 leading-relaxed">{t('prosody.consent')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant={c.usable ? 'outline' : 'default'} disabled={!c.capable || c.running || c.remaining === 0} onClick={() => void c.run()}>
              {c.running ? t('prosody.generating') : c.error ? t('common.retry') : t('prosody.generate')}
            </Button>
            {c.running && <Button variant="outline" onClick={c.stop}>{t('prosody.stop')}</Button>}
          </div>
          <div aria-live="polite" className="space-y-1 text-xs text-ink-600">
            <p className="tnum">{t('prosody.progress', { ready: c.ready, total: c.total, remaining: c.remaining })}</p>
            <p className="tnum">{t('prosody.coverage', c.coverage)}</p>
            {c.oversized > 0 && <p>{t('prosody.oversized', { total: c.oversized })}</p>}
            {!c.capable && <p className="text-bad-700">{t('prosody.unsupportedBrowser')}</p>}
            {c.error && <p role="alert" className="text-bad-700 break-words">{t('prosody.failed', { total: 1, message: c.error })}</p>}
            {c.stopped && <p>{t('prosody.stopped')}</p>}
            {!c.running && c.remaining === 0 && c.ready > 0 && <p>{t('prosody.complete')}</p>}
            {c.changed && c.usable ? <p>{t('prosody.staged')}</p> : !c.usable && !c.running && c.remaining === 0 ? <p>{t('prosody.noMarks')}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-3">
            <Button variant="outline" aria-pressed={!c.mode} onClick={() => onMode(false)}>{t('prosody.plain')}</Button>
            <Button variant={c.mode ? 'default' : 'outline'} aria-pressed={c.mode} disabled={!( !c.running && c.remaining === 0) || !c.usable} onClick={onDisplay}>
              {c.mode && c.changed ? t('prosody.update') : t('prosody.marked')}
            </Button>
          </div>
          <fieldset className="border-t border-ink-200 pt-2">
            <legend className="text-xs text-ink-600">{t('prosody.layers')}</legend>
            <div className="grid grid-cols-2 gap-x-3">
              {layerNames.map((layer) => (
                <label key={layer} className="flex min-h-10 items-center gap-2 cursor-pointer text-xs">
                  <input type="checkbox" checked={c.layers[layer]} onChange={() => c.toggleLayer(layer)} className="h-4 w-4 accent-accent-700 shrink-0" />
                  <span>{t(`prosody.${layer}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <details className="border-t border-ink-200 pt-2">
            <summary className="cursor-pointer min-h-10 text-xs flex items-center">{t('prosody.connectionDetails')}</summary>
            {details.length ? <ul className="space-y-2 text-xs break-words">
              {details.map(({ key, ...vars }) => <li key={key}>{t('prosody.connection', vars)}</li>)}
            </ul> : <p className="text-xs text-ink-600">{t('prosody.noConnections')}</p>}
          </details>
        </div>
      )}
    </div>
  );
}
