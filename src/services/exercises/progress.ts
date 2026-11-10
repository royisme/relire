/**
 * How far a learner is through a unit, counted from the stored item states.
 * Pure; the practice page and the sidebar both draw it. Does not read storage.
 */
import type { ExerciseItemState, ExerciseUnit } from '../../types/exercises';

export interface UnitProgress {
  total: number;
  /** Items that have been checked. */
  checked: number;
  /** Checked items that were right. */
  correct: number;
}

export function unitProgress(unit: Pick<ExerciseUnit, 'items'>, states: ExerciseItemState[]): UnitProgress {
  const ids = new Set(unit.items.map((item) => item.id));
  // A state of an item the unit no longer has (an edited unit) counts for nothing.
  const current = states.filter((state) => ids.has(state.itemId) && state.checked);
  return {
    total: unit.items.length,
    checked: current.length,
    correct: current.filter((state) => state.checked?.correct).length,
  };
}
