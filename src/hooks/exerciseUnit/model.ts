/**
 * What the sheet knows about each item of the open unit, and the counts the
 * footer shows. Plain data and pure functions; `useExerciseUnit` owns the state
 * and `actions.ts` the work that changes it. Does not read storage.
 */
import type { Explanation, Hint } from '../../types/exerciseAi';
import {
  effectiveItemType,
  type CheckedResult,
  type ExerciseAnswer,
  type ExerciseItemState,
  type ExerciseType,
  type ExerciseUnit,
} from '../../types/exercises';
import { emptyAnswer, isAnswerFilled, restoreAnswer } from '../../services/exercises/answer';

/** What an item is waiting for right now. */
export type ItemBusy = 'check' | 'hint' | 'explain';

export interface ItemRuntime {
  answer: ExerciseAnswer;
  /** Null until the learner checks the item. */
  checked: CheckedResult | null;
  hintShown: boolean;
  explanationShown: boolean;
  busy: ItemBusy | null;
  /** Why the last check, hint or explanation did not happen; null when it did. */
  error: string | null;
  /** The hint's text. Only the flag is stored, so after a reload it is fetched again on request. */
  hint: Hint | null;
  explanation: Explanation | null;
}

export type ItemMap = Record<string, ItemRuntime>;

const freshItem = (answer: ExerciseAnswer): ItemRuntime => ({
  answer,
  checked: null,
  hintShown: false,
  explanationShown: false,
  busy: null,
  error: null,
  hint: null,
  explanation: null,
});

/** The sheet as it stands after a reset, or for a unit nobody has touched. */
export const emptyItems = (unit: ExerciseUnit): ItemMap =>
  Object.fromEntries(unit.items.map((item) => [item.id, freshItem(emptyAnswer(item))]));

/** The sheet restored from the stored item states (one per item the learner touched). */
export function restoreItems(unit: ExerciseUnit, states: ExerciseItemState[]): ItemMap {
  const byItem = new Map(states.map((state) => [state.itemId, state]));
  return Object.fromEntries(
    unit.items.map((item) => {
      const state = byItem.get(item.id);
      if (!state) return [item.id, freshItem(emptyAnswer(item))];
      return [
        item.id,
        {
          ...freshItem(restoreAnswer(item, state.answer)),
          checked: state.checked,
          hintShown: state.hintShown,
          explanationShown: state.explanationShown,
        },
      ];
    }),
  );
}

export interface SheetProgress {
  total: number;
  checked: number;
  correct: number;
  /** Items that can be checked now: answerable, filled in, not yet checked and not waiting. */
  pending: number;
}

/** True when `type` has a real control, so its items can be answered and checked. */
export type AnswerableTypes = (type: ExerciseType) => boolean;

export function checkable(unit: ExerciseUnit, itemId: string, items: ItemMap, canAnswer: AnswerableTypes): boolean {
  const item = unit.items.find((candidate) => candidate.id === itemId);
  const view = items[itemId];
  if (!item || !view || view.checked || view.busy === 'check') return false;
  const type = effectiveItemType(item, unit);
  return canAnswer(type) && isAnswerFilled(type, view.answer);
}

export function sheetProgress(unit: ExerciseUnit, items: ItemMap, canAnswer: AnswerableTypes): SheetProgress {
  const views = unit.items.map((item) => items[item.id]).filter(Boolean);
  return {
    total: unit.items.length,
    checked: views.filter((view) => view.checked).length,
    correct: views.filter((view) => view.checked?.correct).length,
    pending: unit.items.filter((item) => checkable(unit, item.id, items, canAnswer)).length,
  };
}
