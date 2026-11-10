/** Prepares and saves the spelling-sound drill before opening Practice; the shared saver owns save-only retries. */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import { useUnitSaver } from '../../hooks/useUnitSaver';
import { prepareSpellingDrill } from '../../services/exercises/fromSpelling';
import type { SpellingSoundsPack } from '../../types/spellingSounds';
import { Button } from '../ui/button';

export function PractiseLetterSounds({ pack }: { pack: SpellingSoundsPack }) {
  const { t } = useTranslation();
  const { status, save } = useUnitSaver();
  const working = status.kind === 'working';
  async function practise() {
    const units = await save(() => prepareSpellingDrill({ pack, t }));
    if (units) navigate({ name: 'practiceSet', area: 'listening', setId: units[0].setId });
  }
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="h-auto min-h-10 min-w-40 max-w-full whitespace-normal break-words"
        disabled={working}
        aria-busy={working}
        aria-label={t('spellingSounds.practise')}
        onClick={() => void practise()}
      >
        <span className="inline-grid place-items-center">
          <span className={`col-start-1 row-start-1${working ? ' invisible' : ''}`}>
            {t('spellingSounds.practise')}
          </span>
          <span className="col-start-1 row-start-1 h-4 w-4" aria-hidden="true">
            {working && <Loader2 className="h-4 w-4 animate-spin" />}
          </span>
        </span>
      </Button>
      <div className="h-20 overflow-auto text-sm text-bad-700" role="status">
        {status.kind === 'error' && (
          <>
            <span className="break-words">{t('gradedReader.saveError', { msg: status.message })}</span>
            <Button variant="ghost" onClick={() => void practise()}>
              {t('common.retry')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
