/**
 * Confirmation before a unit is reset. Says what goes (the answers on the
 * sheet) and what stays (the history of attempts), and shows the real reason
 * if the reset fails. The dialog closes only when the reset happened.
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';

interface ResetDialogProps {
  title: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetDialog({ title, busy, error, onCancel, onConfirm }: ResetDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog onClose={onCancel} label={t('practice.resetTitle')} className="max-w-sm">
      <OverlayHeader title={t('practice.resetTitle')} onClose={onCancel} closeLabel={t('common.close')} />
      <div className="space-y-4 p-5">
        <p className="break-words text-sm text-ink-700">{t('practice.resetBody', { title })}</p>
        {error && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{t('practice.reset')}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
