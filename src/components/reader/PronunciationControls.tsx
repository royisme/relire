/** Floating pronunciation controls. Generation/status never add rows to the reading column. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, X } from 'lucide-react';
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
  const opener = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number>();
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      if (panel.current) setAvailableHeight(Math.max(40, window.innerHeight - Math.max(0, panel.current.getBoundingClientRect().top) - 16));
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, { passive: true });
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        opener.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const complete = !c.restoring && !c.running && c.remaining === 0;
  const details = Object.entries(c.displayed).flatMap(([id, markers]) => markers.connections.map((connection, index) => ({
    key: `${id}-${index}`,
    left: markers.words[connection.left].source,
    right: markers.words[connection.right].source,
    type: t(`prosody.${connection.type}`),
    sound: connection.sound,
  })));

  return (
    <div ref={root} className="contents">
      <span className="inline-flex items-center gap-2">
        <Button
          variant="outline"
          role="switch"
          data-pronunciation-toggle
          aria-label={t('prosody.title')}
          aria-checked={c.mode}
          aria-busy={c.restoring}
          disabled={c.restoring}
          onClick={(event) => {
            if (c.mode) onMode(false);
            else if (c.canDisplay) onDisplay();
            else {
              opener.current = event.currentTarget;
              onOpen();
              setOpen(true);
            }
          }}
        >
          <span aria-hidden="true" className={`relative h-4 w-7 shrink-0 rounded-full ${c.mode ? 'bg-accent-700' : 'bg-ink-500'}`}>
            <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-surface ${c.mode ? 'translate-x-3' : ''}`} />
          </span>
          <span>{t('prosody.marked')}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          data-pronunciation-trigger
          aria-label={t('prosody.controls')}
          title={t('prosody.controls')}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(event) => {
            opener.current = event.currentTarget;
            if (!open) onOpen();
            setOpen(!open);
          }}
        ><SlidersHorizontal className="w-4 h-4" aria-hidden="true" /></Button>
      </span>
      {open && (
        <div
          ref={panel}
          style={{ maxHeight: availableHeight === undefined ? undefined : `min(70vh, 38rem, ${availableHeight}px)` }}
          role="dialog"
          aria-label={t('prosody.title')}
          data-pronunciation-panel
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(70vh,38rem)] overflow-y-auto rounded-lg border border-ink-200 bg-surface p-4 shadow-lg space-y-3 text-sm font-sans text-ink-800"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif font-semibold text-base text-ink-900">{t('prosody.title')}</h2>
            <Button ref={closeButton} variant="ghost" size="icon" aria-label={t('common.close')} onClick={() => {
              setOpen(false);
              opener.current?.focus({ preventScroll: true });
            }}><X className="w-4 h-4" aria-hidden="true" /></Button>
          </div>
          <p className="text-xs text-ink-600 leading-relaxed">{t('prosody.disclosure')}</p>
          <p className="text-xs text-ink-600 leading-relaxed">{t('prosody.consent')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant={c.usable ? 'outline' : 'default'} disabled={!c.capable || c.restoring || c.running || c.remaining + c.skippedCount === 0} onClick={() => void c.run()}>
              {c.running ? t('prosody.generating') : c.error ? t('common.retry') : c.remaining === 0 && c.skippedCount > 0 ? t('prosody.retrySkipped') : t('prosody.generate')}
            </Button>
            {c.running && <Button variant="outline" onClick={c.stop}>{t('prosody.stop')}</Button>}
          </div>
          <div aria-live="polite" className="space-y-1 text-xs text-ink-600">
            {c.restoring && <p>{t('prosody.restoring')}</p>}
            {!c.restoring && !c.running && c.remaining > 0 && <p>{t('prosody.needsGeneration')}</p>}
            <p className="tnum">{t('prosody.progress', { ready: c.ready, total: c.total, remaining: c.remaining })}</p>
            <p className="tnum">{t('prosody.coverage', c.coverage)}</p>
            {c.oversized > 0 && <p>{t('prosody.oversized', { total: c.oversized })}</p>}
            {!c.capable && <p className="text-bad-700">{t('prosody.unsupportedBrowser')}</p>}
            {c.skippedCount > 0 && !c.running && <p className="break-words">{t('prosody.skipped', { total: c.skippedCount, message: Object.values(c.skipped)[0] })}</p>}
            {c.error && <p role="alert" className="text-bad-700 break-words">{t('prosody.failed', { total: 1, message: c.error })}</p>}
            {c.stopped && <p>{t('prosody.stopped')}</p>}
            {complete && c.ready > 0 && <p>{t('prosody.complete')}</p>}
            {complete && c.changed && c.usable ? <p>{t('prosody.staged')}</p> : complete && !c.usable ? <p>{t('prosody.noMarks')}</p> : null}
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
