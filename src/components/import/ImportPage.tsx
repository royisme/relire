/** Import workspace: explicit review/confirmation and durable-first creation; no source images persist. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Article } from '../../types';
import type { ExerciseUnit } from '../../types/exercises';
import { prepareImport, type ImportDraft } from '../../services/exercises/importDraft';
import { createImportedMaterial } from '../../storage/exercises';
import { clipboardImage } from '../../services/importMaterial';
import { useImportSource } from '../../hooks/useImportSource';
import { useImportGuard } from '../../hooks/useImportGuard';
import { navigate } from '../../hooks/useRoute';
import { SourceInput } from './SourceInput';
import { DraftReview } from './DraftReview';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';
import { PageHeader } from '../ui/page-header';
import { field } from './fields';
type Destination = 'exercises' | 'article' | 'both';
type Prepared = { article: Article; units: ExerciseUnit[] };
export function ImportPage({ onCreated }: { onCreated: (article: Article) => void }) {
  const { t } = useTranslation();
  const source = useImportSource();
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [edited, setEdited] = useState(new Set<string>());
  const [destination, setDestination] = useState<Destination>('both');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef(false);
  const [error, setError] = useState('');
  const [restart, setRestart] = useState(false);
  const prepared = useRef<Prepared | null>(null);
  const [previous, setPrevious] = useState(source.result);
  if (source.result && previous !== source.result) {
    setPrevious(source.result);
    setDraft(source.result.draft);
    setSelected(new Set(source.result.draft.units.map((unit) => unit.id)));
    setEdited(new Set());
  }
  function invalidate() {
    prepared.current = null;
    setConfirmed(false);
    setError('');
  }
  function discard() {
    source.dispose();
    setDraft(null);
  }
  const dirty = !!draft || !!source.material || !!source.text.trim() || source.phase !== 'idle';
  const guard = useImportGuard(dirty, saving, discard);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (draft || pendingSave.current || source.phase !== 'idle') return;
      const file = event.clipboardData && clipboardImage(event.clipboardData);
      if (file) {
        event.preventDefault();
        void source.choose(file);
      }
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  });
  async function save() {
    if (!draft || !source.result || !confirmed || pendingSave.current) return;
    if (!prepared.current) {
      if (!draft.materialTitle?.trim() || !draft.sourceText.trim()) {
        setError(t('importFlow.requiredText'));
        return;
      }
      const article: Article = {
        id: `material-${crypto.randomUUID()}`,
        title: draft.materialTitle.trim(),
        content: draft.sourceText.trim(),
        kind: destination === 'exercises' ? 'workbook' : 'article',
        level: '',
        category: '',
        source: source.result.source.name,
        createdAt: new Date().toISOString(),
      };
      const result =
        destination === 'article'
          ? { units: [], errors: [] }
          : prepareImport(
              { ...draft, units: draft.units.filter((unit) => selected.has(unit.id)) },
              source.result.source,
              source.result.mode,
              { materialId: article.id, editedAnswers: edited },
            );
      if (result.errors.length) {
        setError(
          result.errors
            .map((issue) =>
              t(`importFlow.errors.${issue.code}`, { title: issue.unitTitle, msg: issue.issues.join('; ') }),
            )
            .join('\n'),
        );
        return;
      }
      if (destination !== 'article' && !result.units.length) {
        setError(t('importFlow.selectUnits'));
        return;
      }
      prepared.current = { article, units: result.units };
    }
    pendingSave.current = true;
    setSaving(true);
    setError('');
    try {
      const payload = prepared.current;
      await createImportedMaterial(payload.article, payload.units);
      guard.release();
      source.dispose();
      onCreated(payload.article);
      navigate(
        payload.units.length
          ? { name: 'practice', articleId: payload.article.id }
          : { name: 'reader', articleId: payload.article.id },
      );
    } catch (err) {
      setError(t('importFlow.saveFailed', { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }
  return (
    <div
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 min-w-0"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !draft && !saving && source.phase === 'idle') void source.choose(file);
      }}
    >
      <PageHeader title={t('importFlow.heading')} />
      {!draft ? (
        <SourceInput source={source} />
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
              {t('importFlow.saveAs')}
              <select
                aria-label={t('importFlow.saveAs')}
                className={field}
                value={destination}
                onChange={(e) => {
                  invalidate();
                  setDestination(e.target.value as Destination);
                }}
              >
                {(['exercises', 'article', 'both'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`importFlow.destinations.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {t('importFlow.confirm')}
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button className="w-44" disabled={saving || !confirmed} onClick={() => void save()}>
              {t(saving ? 'importFlow.saving' : 'importFlow.save')}
            </Button>
            <Button variant="outline" disabled={saving} onClick={() => setRestart(true)}>
              {t('importFlow.restart')}
            </Button>
          </div>
          <p role="status" className="h-24 overflow-auto whitespace-pre-wrap text-sm text-bad-700 break-words">
            {error}
          </p>
        </>
      )}
      {(guard.leaving || restart) && (
        <Dialog
          label={t('importFlow.leaveTitle')}
          onClose={() => {
            if (!saving) {
              guard.decide(false);
              setRestart(false);
            }
          }}
          className="max-w-sm"
        >
          <OverlayHeader
            title={t('importFlow.leaveTitle')}
            closeLabel={t('common.close')}
            onClose={() => {
              if (!saving) {
                guard.decide(false);
                setRestart(false);
              }
            }}
          />
          <div className="p-5 space-y-4">
            <p className="text-sm">{t(saving ? 'importFlow.savingWait' : 'importFlow.leaveHelp')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  guard.decide(false);
                  setRestart(false);
                }}
              >
                {t('importFlow.keep')}
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  if (restart) {
                    source.reset();
                    setDraft(null);
                    setPrevious(null);
                    invalidate();
                    setRestart(false);
                  } else guard.decide(true);
                }}
              >
                {t('importFlow.discard')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
