/**
 * The screen for an area's `/exercises/unit/:unitId`: reads the unit and shows its sheet, a
 * not-found page when the unit does not exist, or the real reason when it could
 * not be read. Keyed by the unit in `App`, so each unit starts a fresh session.
 */
import type { LearningArea } from '../../types/learningArea';
import { useTranslation } from 'react-i18next';
import { useExerciseUnit } from '../../hooks/useExerciseUnit';
import { Button } from '../ui/button';
import { NotFoundView } from '../shell/NotFoundView';
import { UnitSheet } from './UnitSheet';
import { TopicWorkbench } from './TopicWorkbench';
import type { VocabularyWordLookup } from '../../services/vocabulary/identity';

export function UnitView({
  unitId,
  area,
  onMissingKey,
  onWord,
}: {
  unitId: string;
  area: LearningArea;
  onMissingKey: () => void;
  onWord: VocabularyWordLookup;
}) {
  const { t } = useTranslation();
  const session = useExerciseUnit(unitId, { onMissingKey });

  if (session.status === 'missing' || (session.unit && session.unit.learningArea !== area))
    return <NotFoundView reason="unit" area={area} />;
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
  if (session.unit.topicOrigin)
    return (
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-28 sm:px-6">
        <TopicWorkbench session={session} />
      </div>
    );
  return <UnitSheet unit={session.unit} session={session} onWord={onWord} />;
}
