/**
 * One exercise unit for its sheet: loads the unit and its item states, keeps
 * the learner's answers, saves drafts as they type, and runs checks, hints and
 * explanations through `exerciseUnit/actions`. The screen only draws this and
 * never touches storage. Leaving the unit drops late results silently; a reset
 * moves the reset token, so work that began before it cannot write after it.
 * Redoing one item clears its own row and drops that item's queued draft, so the
 * old answer cannot be written back; the redo carries the sheet's reset token, so
 * one begun before a reset is rejected instead of clearing a newer answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearItemState, getUnitSnapshot, resetUnit, saveItemProgress, StaleResetError } from '../storage/exercises';
import { errorMessage } from '../services/ai/errors';
import type { ExerciseAnswer, ExerciseUnit } from '../types/exercises';
import { runCheck, runExplanation, runHint, type ActionContext } from './exerciseUnit/actions';
import { cancelDrafts, dropDraft, queueDraft, type DraftMap } from './exerciseUnit/drafts';
import {
  checkable,
  emptyItems,
  restoreItems,
  sheetProgress,
  type ItemMap,
  type ItemRuntime,
  type SheetProgress,
} from './exerciseUnit/model';

export type { ItemBusy, ItemRuntime, SheetProgress } from './exerciseUnit/model';

/** How long a pause in typing is before the draft is written. */
const DRAFT_DELAY_MS = 350;

type Load =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; unit: ExerciseUnit };

export interface ExerciseUnitSession {
  status: Load['status'];
  /** The reason the unit could not be read, when `status` is `error`. */
  loadError: string | null;
  unit: ExerciseUnit | null;
  items: ItemMap;
  progress: SheetProgress;
  /** Why a draft or a flag could not be saved; null when the last write worked. */
  saveError: string | null;
  setAnswer: (itemId: string, answer: ExerciseAnswer) => void;
  check: (itemId: string) => Promise<void>;
  checkAll: () => Promise<void>;
  requestHint: (itemId: string) => Promise<void>;
  requestExplanation: (itemId: string) => Promise<void>;
  /** Clears the answers and keeps the history. Resolves false (and sets `resetError`) when it failed. */
  reset: () => Promise<boolean>;
  /** Clears one item's answer and result, keeping its attempts, so it can be tried again. */
  resetItem: (itemId: string) => Promise<void>;
  resetting: boolean;
  resetError: string | null;
  /** Reads the unit again (after a read failure). */
  reload: () => void;
}

interface Options {
  /** The AI call needs a key: take the learner to Settings. */
  onMissingKey: () => void;
}

export function useExerciseUnit(unitId: string, { onMissingKey }: Options): ExerciseUnitSession {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [items, setItems] = useState<ItemMap>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  // Identity of the open sheet: bumped when the learner leaves, so late results are ignored.
  const session = useRef(0);
  // Ends the session. A function, because the counter is deliberately read when the cleanup runs.
  const endSession = useCallback(() => {
    session.current++;
  }, []);
  const token = useRef(0);
  const itemsRef = useRef<ItemMap>({});
  const unitRef = useRef<ExerciseUnit | null>(null);
  const drafts = useRef<DraftMap>(new Map());
  // Work in flight by `kind:itemId`, so a second press before the screen redraws starts nothing.
  const running = useRef(new Set<string>());
  const onMissingKeyRef = useRef(onMissingKey);
  // The latest values for callbacks that outlive a render; refs are written after commit.
  useEffect(() => {
    onMissingKeyRef.current = onMissingKey;
  });

  const reload = useCallback(() => {
    endSession();
    cancelDrafts(drafts.current);
    unitRef.current = null;
    setResetting(false);
    setResetError(null);
    setLoad({ status: 'loading' });
    setLoadKey((key) => key + 1);
  }, [endSession]);

  const writeDraft = useCallback(
    (itemId: string) => {
      const draft = drafts.current.get(itemId);
      if (!draft) return;
      dropDraft(drafts.current, itemId);
      const mine = session.current;
      const isCurrent = () => mine === session.current && draft.token === token.current;
      saveItemProgress(unitId, itemId, draft.token, { answer: draft.answer }).then(
        () => isCurrent() && setSaveError(null),
        (err) => {
          if (!isCurrent()) return;
          // Another writer reset or restored this sheet: discard our draft and read their state.
          if (err instanceof StaleResetError) return reload();
          setSaveError(errorMessage(err));
        },
      );
    },
    [unitId, reload],
  );

  const flushDrafts = useCallback(() => [...drafts.current.keys()].forEach(writeDraft), [writeDraft]);

  useEffect(() => {
    const mine = ++session.current;
    void (async () => {
      try {
        const { unit, states, resetToken } = await getUnitSnapshot(unitId);
        if (mine !== session.current) return;
        if (!unit) return setLoad({ status: 'missing' });
        token.current = resetToken;
        unitRef.current = unit;
        itemsRef.current = restoreItems(unit, states);
        setItems(itemsRef.current);
        setSaveError(null);
        setLoad({ status: 'ready', unit });
      } catch (err) {
        if (mine === session.current) setLoad({ status: 'error', message: errorMessage(err) });
      }
    })();
    const onHide = () => flushDrafts();
    window.addEventListener('pagehide', onHide);
    const pending = drafts.current;
    return () => {
      window.removeEventListener('pagehide', onHide);
      // Leaving the unit keeps what was typed; the writes finish on their own and report nothing.
      [...pending.keys()].forEach(writeDraft);
      endSession();
    };
  }, [unitId, loadKey, flushDrafts, writeDraft, endSession]);

  const patch = useCallback((itemId: string, partial: Partial<ItemRuntime>) => {
    const current = itemsRef.current;
    if (!current[itemId]) return;
    itemsRef.current = { ...current, [itemId]: { ...current[itemId], ...partial } };
    setItems(itemsRef.current);
  }, []);

  /** Context for one piece of work; it is current only while the sheet is open and the token has not moved. */
  const context = (unit: ExerciseUnit): ActionContext => {
    const mine = session.current;
    const started = token.current;
    return {
      unit,
      token: started,
      item: (itemId) => itemsRef.current[itemId],
      patch,
      isCurrent: () => mine === session.current && started === token.current,
      onForeignReset: reload,
      onMissingKey: () => onMissingKeyRef.current(),
      onSaveError: setSaveError,
    };
  };

  const setAnswer = (itemId: string, answer: ExerciseAnswer) => {
    const unit = unitRef.current;
    if (!unit || itemsRef.current[itemId]?.checked) return;
    patch(itemId, { answer, error: null });
    queueDraft(drafts.current, itemId, { answer, token: token.current }, DRAFT_DELAY_MS, writeDraft);
  };

  /** Runs `work` on the open unit unless the same work for the same item is already running. */
  const once = async (action: string, work: (unit: ExerciseUnit) => Promise<void>) => {
    const unit = unitRef.current;
    const key = `${session.current}:${token.current}:${action}`;
    if (!unit || running.current.has(key)) return;
    running.current.add(key);
    try {
      await work(unit);
    } finally {
      running.current.delete(key);
    }
  };

  const check = (itemId: string) =>
    // A pending draft stays: if the learner leaves before the grade arrives, what they typed is still saved,
    // and once the item is checked the store ignores later drafts.
    once(`check:${itemId}`, (unit) => runCheck(context(unit), itemId));

  const checkAll = async () => {
    const unit = unitRef.current;
    if (!unit) return;
    const ids = unit.items.map((item) => item.id).filter((id) => checkable(unit, id, itemsRef.current));
    await Promise.all(ids.map(check));
  };

  const reset = async () => {
    const unit = unitRef.current;
    if (!unit) return false;
    const mine = session.current;
    setResetting(true);
    setResetError(null);
    try {
      const next = await resetUnit(unit.id);
      if (mine !== session.current) return false;
      cancelDrafts(drafts.current);
      token.current = next;
      itemsRef.current = emptyItems(unit);
      setItems(itemsRef.current);
      setSaveError(null);
      return true;
    } catch (err) {
      if (mine === session.current) setResetError(errorMessage(err));
      return false;
    } finally {
      if (mine === session.current) setResetting(false);
    }
  };

  const resetItem = async (itemId: string) => {
    const unit = unitRef.current;
    if (!unit) return;
    // The draft queued before the redo would write the old answer back into the cleared item.
    dropDraft(drafts.current, itemId);
    const mine = session.current;
    const started = token.current;
    try {
      await clearItemState(unit.id, itemId, started);
      if (mine !== session.current) return;
      const fresh = emptyItems(unit)[itemId];
      if (fresh) patch(itemId, fresh);
    } catch (err) {
      if (mine !== session.current) return;
      // Another writer reset or restored this sheet: read their state instead of clearing ours.
      if (err instanceof StaleResetError) return reload();
      patch(itemId, { error: errorMessage(err) });
    }
  };

  const unit = load.status === 'ready' ? load.unit : null;
  return {
    status: load.status,
    loadError: load.status === 'error' ? load.message : null,
    unit,
    items,
    progress: unit ? sheetProgress(unit, items) : { total: 0, checked: 0, correct: 0, pending: 0 },
    saveError,
    setAnswer,
    check,
    checkAll,
    requestHint: (itemId) => once(`hint:${itemId}`, (u) => runHint(context(u), itemId)),
    requestExplanation: (itemId) => once(`explain:${itemId}`, (u) => runExplanation(context(u), itemId)),
    reset,
    resetItem,
    resetting,
    resetError,
    reload,
  };
}
