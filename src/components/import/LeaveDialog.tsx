/** The "discard this import?" question, asked when leaving the page or pressing Start over; the decision lives in useImportSession. */
import { useTranslation } from 'react-i18next';
import type { useImportSession } from '../../hooks/useImportSession';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';

export function LeaveDialog({ session, saving }: { session: ReturnType<typeof useImportSession>; saving: boolean }) {
  const { t } = useTranslation();
  if (!session.leaveOpen) return null;
  return (
    <Dialog label={t('importFlow.leaveTitle')} onClose={session.keep} className="max-w-sm">
      <OverlayHeader title={t('importFlow.leaveTitle')} closeLabel={t('common.close')} onClose={session.keep} />
      <div className="p-5 space-y-4">
        <p className="text-sm">{t(saving ? 'importFlow.savingWait' : 'importFlow.leaveHelp')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={saving} onClick={session.keep}>
            {t('importFlow.keep')}
          </Button>
          <Button disabled={saving} onClick={session.discard}>
            {t('importFlow.discard')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
