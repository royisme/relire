/**
 * One exercise unit for its sheet: loads the unit and its item states, keeps
 * the learner's answers, saves drafts as they type, and runs checks, hints and
 * explanations through `exerciseUnit/actions`. The screen only draws this and
 * never touches storage. Leaving the unit drops late results silently; a reset
 * moves the reset token, so work that began before it cannot write after it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getResetToken,
  getUnit,
  listItemStates,
  resetUnit,
  saveItemProgress,
  StaleResetError,
} from '../storage/exercises';
import { errorMessage } from '../services/ai/errors';
import type { ExerciseAnswer, ExerciseUnit } from '../types/exercises';
import { runCheck, runExplanation, runHint, type ActionContext } from './exerciseUnit/actions';
import {
  checkable,
  emptyItems,
  restoreItems,
  sheetProgress,
  type AnswerableTypes,
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
  resetting: boolean;
  resetError: string | null;
  /** Reads the unit again (after a read failure). */
  reload: () => void;
}

interface Options {
  /** Whether items of this type have a control; the others are shown but cannot be checked. */
  canAnswer: AnswerableTypes;
  /** The AI call needs a key: take the learner to Settings. */
  onMissingKey: () => void;
}

export function useExerciseUnit(unitId: string, { canAnswer, onMissingKey }: Options): ExerciseUnitSession {
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
  const drafts = useRef(new Map<string, { answer: ExerciseAnswer; token: number; timer: number }>());
  // Work in flight by `kind:itemId`, so a second press before the screen redraws starts nothing.
  const running = useRef(new Set<string>());
  const onMissingKeyRef = useRef(onMissingKey);
  // The latest values for callbacks that outlive a render; refs are written after commit.
  useEffect(() => {
    itemsRef.current = items;
    onMissingKeyRef.current = onMissingKey;
  });

  const writeDraft = useCallback(
    (itemId: string) => {
      const draft = drafts.current.get(itemId);
      if (!draft) return;
      window.clearTimeout(draft.timer);
      drafts.current.delete(itemId);
      const mine = session.current;
      saveItemProgress(unitId, itemId, draft.token, { answer: draft.answer }).then(
        () => mine === session.current && setSaveError(null),
        (err) => {
          // A reset or delete since the edit makes the draft obsolete, not an error.
          if (mine !== session.current || err instanceof StaleResetError) return;
          setSaveError(errorMessage(err));
        },
      );
    },
    [unitId],
  );

  const flushDrafts = useCallback(() => [...drafts.current.keys()].forEach(writeDraft), [writeDraft]);

  const cancelDrafts = () => {
    drafts.current.forEach((draft) => window.clearTimeout(draft.timer));
    drafts.current.clear();
  };

  useEffect(() => {
    const mine = ++session.current;
    void (async () => {
      try {
        // The token first: anything written for what is read next must carry a token no newer than the read.
        const readToken = await getResetToken(unitId);
        const unit = await getUnit(unitId);
        if (!unit) return mine === session.current ? setLoad({ status: 'missing' }) : undefined;
        const states = await listItemStates(unitId);
        if (mine !== session.current) return;
        token.current = readToken;
        unitRef.current = unit;
        setItems(restoreItems(unit, states));
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
    setItems((prev) => (prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], ...partial } } : prev));
  }, []);

  const reload = useCallback(() => {
    cancelDrafts();
    setLoad({ status: 'loading' });
    setLoadKey((key) => key + 1);
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
    const previous = drafts.current.get(itemId);
    if (previous) window.clearTimeout(previous.timer);
    drafts.current.set(itemId, {
      answer,
      token: token.current,
      timer: window.setTimeout(() => writeDraft(itemId), DRAFT_DELAY_MS),
    });
  };

  /** Runs `work` on the open unit unless the same work for the same item is already running. */
  const once = async (key: string, work: (unit: ExerciseUnit) => Promise<void>) => {
    const unit = unitRef.current;
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
    const ids = unit.items.map((item) => item.id).filter((id) => checkable(unit, id, itemsRef.current, canAnswer));
    await Promise.all(ids.map(check));
  };

  const reset = async () => {
    const unit = unitRef.current;
    if (!unit) return false;
    setResetting(true);
    setResetError(null);
    try {
      const next = await resetUnit(unit.id);
      cancelDrafts();
      token.current = next;
      setItems(emptyItems(unit));
      setSaveError(null);
      return true;
    } catch (err) {
      setResetError(errorMessage(err));
      return false;
    } finally {
      setResetting(false);
    }
  };

  const unit = load.status === 'ready' ? load.unit : null;
  return {
    status: load.status,
    loadError: load.status === 'error' ? load.message : null,
    unit,
    items,
    progress: unit ? sheetProgress(unit, items, canAnswer) : { total: 0, checked: 0, correct: 0, pending: 0 },
    saveError,
    setAnswer,
    check,
    checkAll,
    requestHint: (itemId) => once(`hint:${itemId}`, (u) => runHint(context(u), itemId)),
    requestExplanation: (itemId) => once(`explain:${itemId}`, (u) => runExplanation(context(u), itemId)),
    reset,
    resetting,
    resetError,
    reload,
  };
}
