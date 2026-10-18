/**
 * Every exercise unit with how far the learner is in each, counted from the
 * stored item states, kept current while units are made, checked, reset or
 * deleted. Callers group the rows by `unit.setId`. Does not make units
 * (`useExerciseGeneration`).
 */
import { useEffect, useState } from 'react';
import { listItemStates, listUnits, subscribeExercises } from '../storage/exercises';
import { errorMessage } from '../services/ai/errors';
import { unitProgress, type UnitProgress } from '../services/exercises/progress';
import type { ExerciseUnit } from '../types/exercises';

export interface UnitRow {
  unit: ExerciseUnit;
  progress: UnitProgress;
}

interface Loaded {
  rows: UnitRow[];
  error: string | null;
}

export function useUnitRows() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      listUnits()
        .then(async (units) => {
          const states = await Promise.all(units.map((unit) => listItemStates(unit.id)));
          return units.map((unit, index): UnitRow => ({ unit, progress: unitProgress(unit, states[index]) }));
        })
        .then(
          (rows) => live && setLoaded({ rows, error: null }),
          (err) => live && setLoaded({ rows: [], error: errorMessage(err) }),
        );
    void load();
    const unsubscribe = subscribeExercises(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return { loading: !loaded, rows: loaded?.rows ?? [], error: loaded?.error ?? null };
}
