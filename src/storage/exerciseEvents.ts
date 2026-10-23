/**
 * Change notifications for the exercise stores (`units`, `itemStates`,
 * `attempts`). Lives apart from `exercises.ts` so `db.ts` can announce a
 * cascade delete or a restore without importing the module that imports it.
 * Owns the listener set only; it knows nothing about what changed.
 */
const listeners = new Set<() => void>();

/** Calls `listener` after a transaction that touched the exercise stores committed. Returns the unsubscribe. */
export function subscribeExercises(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announces a committed change. Call only after the transaction's `done` resolved. */
export const exercisesChanged = () => listeners.forEach((listener) => listener());
