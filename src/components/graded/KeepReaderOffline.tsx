/** Explicit offline-save control; success appears only after the committed cache write, never a disposable fetch. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepReaderOffline } from '../../services/gradedReaders/service';
import type { ReaderSummary } from '../../services/gradedReaders/catalogue';
import { errorMessage } from '../../services/ai/errors';
import { Button } from '../ui/button';

export function KeepReaderOffline({ entry }: { entry: ReaderSummary }) {
  const { t } = useTranslation();
  const live = useRef(false);
  const busy = useRef(false);
  const [state, setState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; error?: string }>({
    status: 'idle',
  });
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'saving' });
    try {
      await keepReaderOffline(entry);
      if (live.current) setState({ status: 'saved' });
    } catch (error) {
      if (live.current) setState({ status: 'error', error: errorMessage(error) });
    } finally {
      busy.current = false;
    }
  };
  return (
    <div className="h-24 overflow-auto text-sm">
      <Button variant="outline" disabled={state.status === 'saving'} onClick={() => void save()}>
        {t(state.status === 'saving' ? 'gradedReader.service.saving' : 'gradedReader.service.keepOffline')}
      </Button>
      <p role="status" className="break-words text-ink-600">
        {state.status === 'saved' && t('gradedReader.service.savedReader')}
        {state.status === 'error' && t('gradedReader.service.saveError', { msg: state.error })}
      </p>
    </div>
  );
}
