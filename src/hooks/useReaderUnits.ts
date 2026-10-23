/** Read-only unit snapshots shared by passage Reader resolution and the shadowing log. */
import { useEffect, useState } from 'react';
import type { ExerciseUnit } from '../types/exercises';
import { listUnits, subscribeExercises } from '../storage/exercises';
import { errorMessage } from '../services/ai/errors';

export function useReaderUnits() {
  const [units, setUnits] = useState<ExerciseUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let request = 0;
    const load = async () => {
      const mine = ++request;
      try {
        const rows = await listUnits();
        if (!live || mine !== request) return;
        setUnits(rows);
        setError(null);
      } catch (err) {
        if (!live || mine !== request) return;
        setUnits(null);
        setError(errorMessage(err));
      }
    };
    void load();
    const unsubscribe = subscribeExercises(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  return { units, error };
}
