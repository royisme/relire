/** Owns the mounted edition's draft debounce and bounded action status; serialized durable writes stay in session.ts. */
import { useEffect, useRef, useState } from 'react';
import type { ExerciseAnswer } from '../types/exercises';
import { readerSession, type OpenedReader } from '../services/gradedReaders/session';
import { StaleReaderError } from '../storage/gradedReaders';
import { errorMessage } from '../services/ai/errors';

export function useReaderWorkspace(opened: OpenedReader, reload: () => void) {
  const [row, setRow] = useState(opened.row);
  const [, redraw] = useState(0);
  const live = useRef(true);
  const [writer] = useState(() => readerSession(opened, setRow));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const [status, setStatus] = useState<{ pending: string | null; error: string | null; owner: string | null }>({
    pending: null,
    error: null,
    owner: null,
  });
  const retry = useRef<() => void>(() => undefined);
  const run = (owner: string, action: () => Promise<void>) => {
    if (busy.current) return;
    clearTimeout(timer.current);
    busy.current = true;
    setStatus({ pending: owner, error: null, owner });
    retry.current = () => run(owner, action);
    void action()
      .then(
        () => {
          if (live.current) setStatus({ pending: null, error: null, owner });
        },
        (error: unknown) => {
          if (!live.current) return;
          if (error instanceof StaleReaderError) reload();
          else setStatus({ pending: null, error: errorMessage(error), owner });
        },
      )
      .finally(() => {
        busy.current = false;
      });
  };
  useEffect(() => {
    live.current = true;
    writer.listen(setRow);
    return () => {
      live.current = false;
      writer.listen();
      clearTimeout(timer.current);
      // A quick Back still flushes the captured session, never a newly adopted epoch.
      void writer.flush().catch(() => undefined);
    };
  }, [writer]);
  return {
    row,
    answers: writer.answers(),
    ...status,
    retry: () => retry.current(),
    change: (id: string, answer: ExerciseAnswer) => {
      writer.draft(id, answer);
      redraw((value) => value + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => run(id, writer.flush), 300);
    },
    check: (id: string) => run(id, () => writer.check(id)),
    redo: (id: string) => run(id, () => writer.redo(id)),
    complete: () => run('completion', () => writer.complete(row.completedAt === null)),
  };
}
