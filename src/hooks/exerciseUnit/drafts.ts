/**
 * The sheet's pending autosaves: one debounced write per item, so typing is
 * saved once the learner pauses, leaving the unit or hiding the page flushes
 * them, and a redo of one item drops only its own. Keeps no answers of its own:
 * `useExerciseUnit` supplies the write and the reset token. Does not touch
 * storage.
 */
import type { ExerciseAnswer } from '../../types/exercises';

export interface PendingDraft {
  answer: ExerciseAnswer;
  /** The unit's reset token when the answer was typed. */
  token: number;
  timer: ReturnType<typeof setTimeout>;
}

export type DraftMap = Map<string, PendingDraft>;

/** Queues the autosave of one item, replacing a draft it already had. */
export function queueDraft(
  drafts: DraftMap,
  itemId: string,
  draft: { answer: ExerciseAnswer; token: number },
  delayMs: number,
  write: (itemId: string) => void,
): void {
  dropDraft(drafts, itemId);
  const timer = setTimeout(() => write(itemId), delayMs);
  drafts.set(itemId, { ...draft, timer });
}

/** Cancels an item's queued autosave and forgets it; every other item keeps its own. */
export function dropDraft(drafts: DraftMap, itemId: string): void {
  const draft = drafts.get(itemId);
  if (!draft) return;
  clearTimeout(draft.timer);
  drafts.delete(itemId);
}

/** Stops every queued autosave; the caller writes or abandons them. */
export function cancelDrafts(drafts: DraftMap): void {
  drafts.forEach((draft) => clearTimeout(draft.timer));
  drafts.clear();
}
