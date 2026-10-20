/** Committed vocabulary read model; owned commits, due times, midnight and focus refresh, never a list writer. */
import { useEffect, useState } from 'react';
import {
  readVocabulary,
  subscribeVocabulary,
  vocabularyChanged,
  saveVocabularyPreferences,
} from '../storage/vocabulary';
export type VocabularyModel = ReturnType<typeof useVocabulary>;
export function useVocabulary() {
  const [data, setData] = useState<Awaited<ReturnType<typeof readVocabulary>>>(() => ({
    rows: [],
    preferences: { newPerDay: 20 },
    day: { date: '', introducedKeys: [] },
    epoch: 0,
    now: Date.now(),
  }));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true,
      sequence = 0;
    let timer: number | undefined;
    const load = async () => {
      const token = ++sequence;
      try {
        const next = await readVocabulary(Date.now());
        if (!live || token !== sequence) return;
        setData(next);
        setError(null);
        window.clearTimeout(timer);
        const midnight = new Date(next.now);
        midnight.setHours(24, 0, 0, 0);
        const future = next.rows.flatMap((row) =>
          row.schedule && row.schedule.phase !== 'review' && row.schedule.dueAt > next.now ? [row.schedule.dueAt] : [],
        );
        const wakeAt = Math.min(midnight.getTime(), ...future);
        timer = window.setTimeout(() => void load(), Math.max(1, wakeAt - Date.now()));
      } catch (error) {
        if (live && token === sequence) setError(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    const unsubscribe = subscribeVocabulary(load);
    const wake = () => {
      void load();
    };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      live = false;
      sequence++;
      unsubscribe();
      window.clearTimeout(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);
  return { ...data, error, refresh: vocabularyChanged, savePreferences: saveVocabularyPreferences };
}
