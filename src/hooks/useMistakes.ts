/** Read-only notebook query; exercise notifications invalidate in-flight reads, not just mounted views. */
import { useEffect, useState } from 'react';
import { getUnit, listMistakes, subscribeExercises, type MistakeEntry } from '../storage/exercises';
import type { ExerciseUnit } from '../types/exercises';
import { errorMessage } from '../services/ai/errors';

export interface MistakeRow extends MistakeEntry {
  unit?: ExerciseUnit;
}

export function useMistakes() {
  const [loaded, setLoaded] = useState<{ rows: MistakeRow[]; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      try {
        const entries = await listMistakes();
        const ids = [...new Set(entries.map(({ attempt }) => attempt.unitId))];
        const units = new Map(await Promise.all(ids.map(async (id) => [id, await getUnit(id)] as const)));
        const rows = entries.map((entry) => {
          const unit = units.get(entry.attempt.unitId);
          return {
            ...entry,
            unit:
              unit?.materialId === entry.attempt.materialId &&
              unit.items.some((item) => item.id === entry.attempt.itemId)
                ? unit
                : undefined,
          };
        });
        if (live && request === sequence) setLoaded({ rows, error: null });
      } catch (err) {
        if (live && request === sequence) setLoaded({ rows: [], error: errorMessage(err) });
      }
    };
    const unsubscribe = subscribeExercises(() => void load());
    void load();
    return () => {
      live = false;
      sequence++;
      unsubscribe();
    };
  }, [revision]);
  return { loading: !loaded, rows: loaded?.rows ?? [], error: loaded?.error, retry: () => setRevision((v) => v + 1) };
}
