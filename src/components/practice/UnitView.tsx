/**
 * The screen for `#/practice/:unitId`: reads the unit and shows its sheet, a
 * not-found page when the unit does not exist, or the real reason when it could
 * not be read. Keyed by the unit in `App`, so each unit starts a fresh session.
 */
import { useTranslation } from 'react-i18next';
import { useExerciseUnit } from '../../hooks/useExerciseUnit';
import type { ExerciseType } from '../../types/exercises';
import { Button } from '../ui/button';
import { NotFoundView } from '../shell/NotFoundView';
import { isPlaceholder } from './controls';
import { UnitSheet } from './UnitSheet';

const canAnswer = (type: ExerciseType) => !isPlaceholder(type);

export function UnitView({ unitId, onMissingKey }: { unitId: string; onMissingKey: () => void }) {
  const { t } = useTranslation();
  const session = useExerciseUnit(unitId, { canAnswer, onMissingKey });

  if (session.status === 'missing') return <NotFoundView reason="unit" />;
  if (session.status === 'error')
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-16 text-center sm:px-6">
        <p role="alert" className="break-words text-sm text-bad-700">
          {session.loadError}
        </p>
        <Button variant="outline" onClick={session.reload}>
          {t('common.retry')}
        </Button>
      </div>
    );
  if (!session.unit) return <div aria-busy="true" className="min-h-[50vh]" />;
  return <UnitSheet unit={session.unit} session={session} />;
}
