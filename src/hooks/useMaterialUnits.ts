/**
 * The exercise units of one article with how far the learner is in each,
 * counted from the stored item states, kept current while units are made,
 * checked, reset or deleted. Also finds which article a unit address belongs to
 * (`useRouteUnits`, for the sidebar). Does not make units (`useExerciseGeneration`).
 */
import { useEffect, useState } from 'react';
import { getUnit, listItemStates, listUnits, subscribeExercises } from '../storage/exercises';
import { errorMessage } from '../services/ai/errors';
import { unitProgress, type UnitProgress } from '../services/exercises/progress';
import type { ExerciseUnit } from '../types/exercises';
import type { Route } from '../utils/routes';

export interface UnitRow {
  unit: ExerciseUnit;
  progress: UnitProgress;
}

interface Loaded {
  materialId: string;
  rows: UnitRow[];
  error: string | null;
}

export function useMaterialUnits(materialId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!materialId) return;
    let live = true;
    const load = () =>
      listUnits(materialId)
        .then(async (units) => {
          const states = await Promise.all(units.map((unit) => listItemStates(unit.id)));
          return units.map((unit, index): UnitRow => ({ unit, progress: unitProgress(unit, states[index]) }));
        })
        .then(
          (rows) => live && setLoaded({ materialId, rows, error: null }),
          (err) => live && setLoaded({ materialId, rows: [], error: errorMessage(err) }),
        );
    void load();
    const unsubscribe = subscribeExercises(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [materialId]);

  // What was loaded for another article does not count for this one.
  const current = loaded && loaded.materialId === materialId ? loaded : null;
  return { loading: materialId !== null && !current, rows: current?.rows ?? [], error: current?.error ?? null };
}

/** The article a unit belongs to, or null while unknown or when there is no such unit. */
export function useUnitMaterial(unitId: string | null) {
  const [found, setFound] = useState<{ unitId: string; materialId: string | null } | null>(null);
  useEffect(() => {
    if (!unitId) return;
    let live = true;
    getUnit(unitId).then(
      (unit) => live && setFound({ unitId, materialId: unit?.materialId ?? null }),
      () => live && setFound({ unitId, materialId: null }),
    );
    return () => {
      live = false;
    };
  }, [unitId]);
  return found && found.unitId === unitId ? found.materialId : null;
}

/** The units listed for the practice place the route is on: the article's own, or the unit's article. */
export function useRouteUnits(route: Route) {
  const unitMaterial = useUnitMaterial(route.name === 'unit' ? route.unitId : null);
  const materialId = route.name === 'practice' ? (route.articleId ?? null) : unitMaterial;
  return { materialId, ...useMaterialUnits(materialId) };
}
