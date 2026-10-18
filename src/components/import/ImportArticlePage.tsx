/** Article import (Read): an image or PDF is transcribed, pasted text is used as it is; the learner reviews it and one article is saved. No source images persist. */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ARTICLE_LEVELS, type Article } from '../../types';
import type { Transcription } from '../../types/transcription';
import { transcribeMaterial } from '../../services/api';
import { saveArticle } from '../../storage/db';
import { useImportSource } from '../../hooks/useImportSource';
import { useImportSession } from '../../hooks/useImportSession';
import { navigate } from '../../hooks/useRoute';
import { SourceInput } from './SourceInput';
import { LeaveDialog } from './LeaveDialog';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { TextField, field } from './fields';

export function ImportArticlePage({ onCreated }: { onCreated: (article: Article) => void }) {
  const { t } = useTranslation();
  const source = useImportSource(
    ({ text, images, signal, access }): Promise<Transcription> =>
      images ? transcribeMaterial({ images, signal }, access) : Promise.resolve({ title: '', text: text.trim() }),
    false,
  );
  const [draft, setDraft] = useState<Transcription | null>(null);
  const [level, setLevel] = useState<(typeof ARTICLE_LEVELS)[number]>('B1');
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef(false);
  const [error, setError] = useState('');
  // The prepared article keeps its id across a failed save; any review edit prepares it again.
  const prepared = useRef<Article | null>(null);
  const [previous, setPrevious] = useState(source.result);
  if (source.result && previous !== source.result) {
    setPrevious(source.result);
    setDraft(source.result.output);
  }
  function invalidate() {
    prepared.current = null;
    setError('');
  }
  const session = useImportSession({
    source,
    hasDraft: !!draft,
    saving,
    // A chosen file and pasted text exclude each other, so neither is silently ignored.
    canChoose: !source.text.trim(),
    clear: () => {
      setDraft(null);
      invalidate();
    },
  });

  async function save() {
    if (!draft || !source.result || pendingSave.current) return;
    if (!prepared.current) {
      if (!draft.title.trim() || !draft.text.trim()) {
        setError(t('importArticle.requiredText'));
        return;
      }
      prepared.current = {
        id: `import-${crypto.randomUUID()}`,
        title: draft.title.trim(),
        content: draft.text.trim(),
        level,
        category: '',
        source: source.result.source.kind === 'text' ? undefined : source.result.source.name,
        createdAt: new Date().toISOString(),
      };
    }
    pendingSave.current = true;
    setSaving(true);
    setError('');
    try {
      const article = prepared.current;
      await saveArticle(article);
      session.release();
      source.dispose();
      onCreated(article);
      navigate({ name: 'reader', articleId: article.id });
    } catch (err) {
      setError(t('importArticle.saveFailed', { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 min-w-0" {...session.dropProps}>
      <PageHeader title={t('importArticle.heading')} subtitle={t('importArticle.subtitle')} />
      {!draft ? (
        <SourceInput kind="article" source={source} page={{ name: 'importArticle' }} />
      ) : (
        <>
          <fieldset disabled={saving} className="space-y-4 min-w-0">
            <section className="space-y-4 min-w-0" aria-label={t('importArticle.review')}>
              <h2 className="font-serif text-xl font-semibold">{t('importArticle.review')}</h2>
              <p className="text-sm text-ink-700">{t('importArticle.reviewHelp')}</p>
              <TextField
                label={t('importArticle.title')}
                value={draft.title}
                onChange={(title) => {
                  invalidate();
                  setDraft({ ...draft, title });
                }}
              />
              <label className="block text-sm">
                {t('importArticle.level')}
                <select
                  aria-label={t('importArticle.level')}
                  className={field}
                  value={level}
                  onChange={(e) => {
                    invalidate();
                    setLevel(e.target.value as typeof level);
                  }}
                >
                  {ARTICLE_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {t(`levels.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label={t('importArticle.body')}
                multiline
                rows={14}
                maxLength={80000}
                value={draft.text}
                onChange={(text) => {
                  invalidate();
                  setDraft({ ...draft, text });
                }}
              />
            </section>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button className="w-44" disabled={saving} onClick={() => void save()}>
              {t(saving ? 'importFlow.saving' : 'importArticle.save')}
            </Button>
            <Button variant="outline" disabled={saving} onClick={session.startOver}>
              {t('importFlow.restart')}
            </Button>
          </div>
          <p role="status" className="h-16 overflow-auto whitespace-pre-wrap text-sm text-bad-700 break-words">
            {error}
          </p>
        </>
      )}
      <LeaveDialog session={session} saving={saving} />
    </div>
  );
}
