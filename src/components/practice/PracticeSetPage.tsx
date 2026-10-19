/** Owns one set's heading and delete destinations; UnitTable owns rows and storage owns all writes. */
import { useMemo, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import { useUnitRows } from '../../hooks/useUnitRows';
import { aggregateSets } from '../../services/exercises/sets';
import type { ExerciseUnit } from '../../types/exercises';
import { Link } from '../shell/Link';
import { NotFoundView } from '../shell/NotFoundView';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { DeleteSetDialog } from './DeleteSetDialog';
import { DeleteUnitDialog } from './DeleteUnitDialog';
import { UnitTable } from './UnitTable';

export function PracticeSetPage({ setId }: { setId: string }) {
  const { t, i18n } = useTranslation();
  const { rows, loading, error } = useUnitRows();
  const set = useMemo(() => aggregateSets(rows, t).find((candidate) => candidate.setId === setId), [rows, t, setId]);
  const [deletingSet, setDeletingSet] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState<ExerciseUnit | null>(null);
  if (loading) return <div aria-busy="true" className="h-56" />;
  if (error)
    return (
      <p role="alert" className="mx-auto max-w-5xl break-words px-4 py-6 text-sm text-bad-700">
        {error}
      </p>
    );
  if (!set) return <NotFoundView reason="set" />;
  const ordered = [...set.rows].sort((a, b) => a.unit.unitNumber - b.unit.unitNumber);
  const unfinished = ordered.find(({ progress }) => progress.checked < progress.total);
  const next = unfinished ?? ordered[0];
  const action = set.progress.checked === 0 ? 'start' : unfinished ? 'continue' : 'practiseAgain';
  const date = new Date(set.createdAt).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <Link
        to={{ name: 'practice' }}
        className="inline-flex h-10 items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t('practice.back')}
      </Link>
      <PageHeader
        title={set.title}
        subtitle={`${t(`levels.${set.level}`)} · ${date} · ${t('practice.exercises', { count: set.rows.length })}`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button onClick={() => navigate({ name: 'unit', unitId: next.unit.id })}>{t(`practice.${action}`)}</Button>
            <Button variant="ghost" className="ml-auto" onClick={() => setDeletingSet(true)}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {t('practice.deleteSet')}
            </Button>
          </div>
        }
      />
      <UnitTable rows={set.rows} onDelete={setDeletingUnit} />
      {deletingSet && (
        <DeleteSetDialog
          setId={setId}
          title={set.title}
          count={set.rows.length}
          onClose={() => setDeletingSet(false)}
          onDeleted={() => navigate({ name: 'practice' })}
        />
      )}
      {deletingUnit && (
        <DeleteUnitDialog
          unit={deletingUnit}
          last={set.rows.length === 1}
          onClose={() => setDeletingUnit(null)}
          onDeleted={() => {
            setDeletingUnit(null);
            if (set.rows.length === 1) navigate({ name: 'practice' });
          }}
        />
      )}
    </div>
  );
}
