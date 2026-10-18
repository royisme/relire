/** Owns one set's heading and delete destinations; UnitTable owns rows and storage owns all writes. */
import { useMemo, useState } from 'react';
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
  const date = new Date(set.createdAt).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <Link to={{ name: 'practice' }} className="inline-flex h-10 items-center text-sm text-ink-700 hover:text-ink-900">
        {t('practice.back')}
      </Link>
      <PageHeader
        title={set.title}
        subtitle={`${t(`levels.${set.level}`)} · ${date} · ${t('practice.exercises', { count: set.rows.length })}`}
        actions={
          <Button variant="outline" onClick={() => setDeletingSet(true)}>
            {t('practice.deleteSet')}
          </Button>
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
