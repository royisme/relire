/** The visible outcome of one settings section's last save: nothing yet, saved, or failed with the real reason. */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../services/ai/errors';

export type SaveStatus = { phase: 'idle' | 'saved' } | { phase: 'failed'; message: string };

export function useSaveStatus() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SaveStatus>({ phase: 'idle' });
  /** Runs the save; true when it worked. */
  const run = useCallback(
    (save: () => void): boolean => {
      try {
        save();
        setStatus({ phase: 'saved' });
        return true;
      } catch (err) {
        setStatus({ phase: 'failed', message: t('settings.saveFailed', { msg: errorMessage(err) }) });
        return false;
      }
    },
    [t],
  );
  /** A failure that happened before saving (a key check), with its own wording. */
  const fail = useCallback((message: string) => setStatus({ phase: 'failed', message }), []);
  const clear = useCallback(() => setStatus({ phase: 'idle' }), []);
  return { status, run, fail, clear };
}
