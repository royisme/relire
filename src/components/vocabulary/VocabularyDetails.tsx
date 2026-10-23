/** Browse details and distinct history-preserving reset versus learner-row deletion confirmations. */
import { useTranslation } from 'react-i18next';
import type { VocabularyJoined } from '../../services/vocabulary/queue';
import { useVocabularyCardActions } from '../../hooks/useVocabularyCardActions';
import { Button } from '../ui/button';
import { Sheet, Dialog, OverlayHeader } from '../ui/overlay';
import { VocabularyAnswer } from './VocabularyAnswer';
export function VocabularyDetails({ word, onClose }: { word: VocabularyJoined; onClose: () => void }) {
  const { t } = useTranslation();
  const actions = useVocabularyCardActions(word.key, onClose);
  return (
    <>
      <Sheet label={word.word} onClose={onClose}>
        <OverlayHeader title={word.word} closeLabel={t('common.close')} onClose={onClose} />
        <div className="space-y-6 overflow-y-auto p-5">
          <VocabularyAnswer word={word} />
          {word.row && (
            <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-4">
              <Button variant="outline" disabled={!word.row.schedule} onClick={() => void actions.prepare('reset')}>
                {t('vocab.reset')}
              </Button>
              <Button variant="outline" onClick={() => void actions.prepare('delete')}>
                {t('vocab.delete')}
              </Button>
            </div>
          )}
          <p className="h-16 overflow-auto break-words text-sm text-bad-700" role="status">
            {actions.error}
          </p>
        </div>
      </Sheet>
      {actions.confirmation && (
        <Dialog label={t(`vocab.${actions.confirmation.kind}`)} onClose={actions.cancel} className="max-w-sm">
          <div className="space-y-4 p-5">
            <h2 className="font-serif text-lg font-semibold">{t(`vocab.${actions.confirmation.kind}`)}</h2>
            <p className="text-sm text-ink-700">{t(`vocab.${actions.confirmation.kind}Help`)}</p>
            <p className="h-16 overflow-auto break-words text-sm text-bad-700" role="alert">
              {actions.error}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={actions.busy} onClick={actions.cancel}>
                {t('common.cancel')}
              </Button>
              <Button disabled={actions.busy} onClick={() => void actions.commit()}>
                {t(actions.busy ? 'vocab.saving' : 'vocab.confirm')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
