import { useCallback, useEffect, useRef } from 'react';

/**
 * Writes `value` with `save` shortly after it changes (debounced), and flushes
 * immediately when the page is hidden so a closing tab does not lose edits.
 * `report(name, error)` is called with null on success.
 */
export function usePersist<T>(
  name: string,
  value: T,
  save: (value: T) => Promise<void>,
  enabled: boolean,
  report: (name: string, error: unknown | null) => void
) {
  const latest = useRef(value);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const reportRef = useRef(report);
  reportRef.current = report;

  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    window.clearTimeout(timer.current);
    saveRef
      .current(latest.current)
      .then(() => reportRef.current(name, null))
      .catch((err) => reportRef.current(name, err));
  }, [name]);

  useEffect(() => {
    if (!enabled) return;
    latest.current = value;
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 200);
  }, [value, enabled, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);
}
