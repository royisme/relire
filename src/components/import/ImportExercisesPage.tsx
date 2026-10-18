/** Exercise import (Practice): extraction, explicit review and durable-first creation of one unit batch; no source images persist. */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EXERCISE_LEVELS, type ExerciseLevel, type ExerciseUnit } from '../../types/exercises';
import { prepareImport, type ImportDraft, type ImportMode } from '../../services/exercises/importDraft';
import { extractMaterial } from '../../services/api';
import { saveUnits } from '../../storage/exercises';
import { useImportSource } from '../../hooks/useImportSource';
import { useImportSession } from '../../hooks/useImportSession';
import { navigate } from '../../hooks/useRoute';
import { SourceInput } from './SourceInput';
import { DraftReview } from './DraftReview';
import { LeaveDialog } from './LeaveDialog';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { field } from './fields';

export function ImportExercisesPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ImportMode>('complete');
  const source = useImportSource(
    async ({ text, images, signal, access }) => ({
      draft: await extractMaterial({ mode, text, images, signal }, access),
      mode,
    }),
    true,
  );
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [edited, setEdited] = useState(new Set<string>());
  const [level, setLevel] = useState<ExerciseLevel | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef(false);
  const [error, setError] = useState('');
  // The prepared batch keeps its ids across a failed save; any review edit prepares it again.
  const prepared = useRef<ExerciseUnit[] | null>(null);
  const [previous, setPrevious] = useState(source.result);
  if (source.result && previous !== source.result) {
    setPrevious(source.result);
    setDraft(source.result.output.draft);
    setSelected(new Set(source.result.output.draft.units.map((unit) => unit.id)));
    setEdited(new Set());
  }
  function invalidate() {
    prepared.current = null;
    setConfirmed(false);
    setError('');
  }
  const session = useImportSession({
    source,
    hasDraft: !!draft,
    saving,
    canChoose: true,
    clear: () => {
      setDraft(null);
      setMode('complete');
      setLevel('');
      invalidate();
    },
  });

  async function save() {
    if (!draft || !source.result || !confirmed || pendingSave.current) return;
    if (!prepared.current) {
      if (!draft.materialTitle?.trim()) {
        setError(t('importExercises.requiredTitle'));
        return;
      }
      if (!level) {
        setError(t('importExercises.levelRequired'));
        return;
      }
      const result = prepareImport(
        { ...draft, units: draft.units.filter((unit) => selected.has(unit.id)) },
        source.result.source,
        source.result.output.mode,
        { setId: crypto.randomUUID(), level, createdAt: Date.now(), editedAnswers: edited },
      );
      if (result.errors.length) {
        setError(
          result.errors
            .map((issue) =>
              t(`importExercises.errors.${issue.code}`, { title: issue.unitTitle, msg: issue.issues.join('; ') }),
            )
            .join('\n'),
        );
        return;
      }
      if (!result.units.length) {
        setError(t('importExercises.selectUnits'));
        return;
      }
      prepared.current = result.units;
    }
    pendingSave.current = true;
    setSaving(true);
    setError('');
    try {
      const units = prepared.current;
      await saveUnits(units);
      session.release();
      source.dispose();
      const [first] = [...units].sort((a, b) => a.unitNumber - b.unitNumber);
      navigate({ name: 'unit', unitId: first.id });
    } catch (err) {
      setError(t('importExercises.saveFailed', { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 min-w-0" {...session.dropProps}>
      <PageHeader title={t('importExercises.heading')} subtitle={t('importExercises.subtitle')} />
      {!draft ? (
        <SourceInput
          kind="exercises"
          source={source}
          page={{ name: 'importExercises' }}
          onDiscard={session.discardSource}
          leaveOpen={session.leaveOpen}
        >
          <label className="block text-sm">
            {t('importExercises.mode')}
            <select
              aria-label={t('importExercises.mode')}
              className={`${field} h-[40px]`}
              value={mode}
              onChange={(e) => setMode(e.target.value as ImportMode)}
            >
              {(['complete', 'extract', 'generate'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`importExercises.modes.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-ink-700">{t(`importExercises.modeHelp.${mode}`)}</p>
        </SourceInput>
      ) : (
        <>
          <fieldset disabled={saving} className="space-y-6 min-w-0">
            <DraftReview
              draft={draft}
              selected={selected}
              edited={edited}
              onChange={(next) => {
                invalidate();
                setDraft(next);
              }}
              onSelect={(id, checked) => {
                invalidate();
                setSelected((old) => {
                  const next = new Set(old);
                  if (checked) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
              onEditAnswer={(key) => {
                invalidate();
                setEdited((old) => new Set([...old, key]));
              }}
            />
            <label className="block text-sm">
              {t('importExercises.level')}
              <select
                aria-label={t('importExercises.level')}
                className={field}
                value={level}
                aria-required
                onChange={(e) => {
                  invalidate();
                  setLevel(e.target.value as ExerciseLevel);
                }}
              >
                <option value="" disabled>
                  {t('importExercises.chooseLevel')}
                </option>
                {EXERCISE_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {t(`levels.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {t('importExercises.confirm')}
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button className="w-44" disabled={saving || !confirmed} onClick={() => void save()}>
              {t(saving ? 'importFlow.saving' : 'importExercises.save')}
            </Button>
            <Button variant="outline" disabled={saving} onClick={session.startOver}>
              {t('importFlow.restart')}
            </Button>
          </div>
          <p role="status" className="h-24 overflow-auto whitespace-pre-wrap text-sm text-bad-700 break-words">
            {error}
          </p>
        </>
      )}
      <LeaveDialog session={session} saving={saving} />
    </div>
  );
}
