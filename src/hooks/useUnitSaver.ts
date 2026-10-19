/**
 * Saving a prepared batch of exercise units with retry of the same payload: a failed save keeps the units (and
 * so their ids), so the next press saves exactly those and never a fresh batch. Owns the payload, the
 * one-save-at-a-time guard and the status the pressed button shows. Does not own what is prepared, the storage
 * (`saveUnits`) or any drawing.
 */
import { useEffect, useRef, useState } from 'react';
import { saveUnits } from '../storage/exercises';
import type { ExerciseUnit } from '../types/exercises';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; units: ExerciseUnit[] };

/** The state behind the hook, apart from React so it can be tested on its own. */
export function createUnitSaver(save: (units: ExerciseUnit[]) => Promise<unknown> = saveUnits) {
  /** Units prepared but not yet committed. */
  let payload: ExerciseUnit[] | null = null;
  let busy = false;
  return {
    /** Forget a prepared batch that failed to save: the next run prepares afresh. */
    drop() {
      payload = null;
    },
    /** Saves the pending batch, or `prepare()`'s; resolves to the saved units, or rejects with the real error. Undefined while another save runs. */
    async run(prepare: () => ExerciseUnit[]): Promise<ExerciseUnit[] | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        const units = (payload ??= prepare());
        await save(units);
        payload = null;
        return units;
      } finally {
        busy = false;
      }
    },
  };
}

export function useUnitSaver() {
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [saver] = useState(createUnitSaver);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  /** Resolves to the saved units; undefined when the save failed (shown in `status`), another is running, or the owner is gone. */
  async function save(prepare: () => ExerciseUnit[]) {
    setStatus({ kind: 'working' });
    try {
      const units = await saver.run(prepare);
      if (!live.current || !units) return undefined;
      setStatus({ kind: 'done', units });
      return units;
    } catch (error) {
      if (live.current) setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }
  return { status, save, drop: () => saver.drop() };
}
