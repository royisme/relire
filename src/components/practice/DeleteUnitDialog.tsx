/** Owns exercise deletion confirmation and commit/error state; the set page owns the destination after deletion. */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../services/ai/errors';
import { deleteUnit } from '../../storage/exercises';
import type { ExerciseUnit } from '../../types/exercises';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';

export function DeleteUnitDialog({
  unit,
  last,
  onClose,
  onDeleted,
}: {
  unit: ExerciseUnit;
  last: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
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
      await deleteUnit(unit.id);
      onDeleted();
    } catch (err) {
      setError(t('practice.deleteUnitFailed', { reason: errorMessage(err) }));
      setBusy(false);
    }
  }
  return (
    <Dialog label={t('practice.deleteUnitTitle')} onClose={cancel} className="max-w-sm">
      <OverlayHeader title={t('practice.deleteUnitTitle')} onClose={cancel} closeLabel={t('common.close')} />
      <div className="space-y-4 p-5">
        <p className="break-words text-sm text-ink-700">{t('practice.deleteUnitBody', { title: unit.title })}</p>
        {last && <p className="text-sm text-ink-700">{t('practice.deleteLastUnit')}</p>}
        {error && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            <span>{t('practice.deleteUnit')}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
