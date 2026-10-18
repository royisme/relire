/**
 * Confirmation before a whole batch is deleted. Says what goes (the batch's
 * units and the answers on them) and what stays (the history of attempts), and
 * shows the real reason if the delete fails. The dialog closes only when the
 * delete committed; the list refreshes itself from the storage change event.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../services/ai/errors';
import { deleteSetData } from '../../storage/db';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';

interface DeleteSetDialogProps {
  setId: string;
  title: string;
  count: number;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteSetDialog({ setId, title, count, onClose, onDeleted }: DeleteSetDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = () => {
    if (!busy) onClose();
  };
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteSetData(setId);
      onDeleted();
    } catch (err) {
      setError(t('practice.deleteSetFailed', { reason: errorMessage(err) }));
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={cancel} label={t('practice.deleteSetTitle')} className="max-w-sm">
      <OverlayHeader title={t('practice.deleteSetTitle')} onClose={cancel} closeLabel={t('common.close')} />
      <div className="space-y-4 p-5">
        <p className="break-words text-sm text-ink-700">{t('practice.deleteSetBody', { title, count })}</p>
        {error && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{t('practice.deleteSet')}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
