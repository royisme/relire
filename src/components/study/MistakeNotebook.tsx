/** The latest wrong snapshot of each item, including those later answered correctly or whose source was removed. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMistakes } from '../../hooks/useMistakes';
import type { Article } from '../../types';
import { GRAMMAR_AREA_IDS, GRAMMAR_TAGS, grammarAreaOf } from '../../types/grammar';
import { Button } from '../ui/button';
import { Link } from '../shell/Link';
import { LookupText } from '../reader/LookupText';
import { MistakeExplanationSheet } from './MistakeExplanationSheet';

const areaLabel = {
  'nouns-determiners': 'nouns',
  'adjectives-adverbs': 'adjectives',
  'verbs-forms': 'verbForms',
  'verbs-use': 'verbUse',
  pronouns: 'pronouns',
  sentence: 'sentence',
  skills: 'skills',
} as const;

interface Props {
  articles: Article[];
  onMissingKey: () => void;
  onWord: (word: string, sentence: string, context?: string) => void;
}

export function MistakeNotebook({ articles, onMissingKey, onWord }: Props) {
  const { t } = useTranslation();
  const { rows, loading, error, retry } = useMistakes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find(({ attempt }) => attempt.id === selectedId);
  const sourceContext = selected?.unit
    ? [selected.unit.instruction, selected.unit.readingPassage?.content].filter(Boolean).join('\n')
    : undefined;
  const lookup = (word: string, sentence: string) => {
    setSelectedId(null);
    onWord(word, sentence, sourceContext);
  };
  return (
    <>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">{t('study.mistakes')}</h1>
          <p className="text-sm text-ink-600">{t('notebook.description')}</p>
        </header>
        {loading && (
          <p role="status" className="text-sm text-ink-600">
            {t('common.loading')}
          </p>
        )}
        {error ? (
          <div className="space-y-2">
            <p role="alert" className="break-words text-sm text-bad-700">
              {t('notebook.loadError', { reason: error })}
            </p>
            <Button variant="outline" onClick={retry}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          !loading && rows.length === 0 && <p className="text-sm text-ink-600">{t('notebook.empty')}</p>
        )}
        {GRAMMAR_AREA_IDS.map((area) => {
          const entries = rows
            .filter(({ attempt }) => grammarAreaOf(attempt.grammarTag) === area)
            .sort((a, b) => GRAMMAR_TAGS.indexOf(a.attempt.grammarTag) - GRAMMAR_TAGS.indexOf(b.attempt.grammarTag));
          if (!entries.length) return null;
          return (
            <section key={area} aria-label={t(`grammarAreas.${areaLabel[area]}`)}>
              <h2 className="font-serif text-lg font-semibold text-ink-900">{t(`grammarAreas.${areaLabel[area]}`)}</h2>
              <ul className="mt-3 divide-y divide-ink-200 border-y border-ink-200">
                {entries.map(({ attempt, resolved, unit }) => {
                  const material = articles.find((article) => article.id === attempt.materialId);
                  const context = unit
                    ? [unit.instruction, unit.readingPassage?.content].filter(Boolean).join('\n')
                    : undefined;
                  const onToken = (word: string, sentence: string) => onWord(word, sentence, context);
                  return (
                    <li key={attempt.id} className="space-y-3 py-5 break-words">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-ink-600">{t(`grammarTags.${attempt.grammarTag}`)}</span>
                        <span className={resolved ? 'text-ok-800' : 'text-bad-700'}>
                          {t(resolved ? 'notebook.resolved' : 'notebook.unresolved')}
                        </span>
                      </div>
                      <p className="font-serif text-lg text-ink-900">
                        <LookupText text={attempt.prompt} onWord={onToken} />
                      </p>
                      <p className="text-sm">
                        <span className="text-ink-600">{t('practice.yourAnswer')}: </span>
                        <span className="font-serif text-base text-bad-700 line-through">
                          <LookupText text={attempt.userAnswer} onWord={onToken} />
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="text-ink-600">{t('practice.expected')}: </span>
                        <span className="font-serif text-base text-ok-800">
                          <LookupText text={attempt.expectedAnswer} onWord={onToken} />
                        </span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => setSelectedId(attempt.id)}>
                          {t('practice.explain')}
                        </Button>
                        {unit && material ? (
                          <Link
                            to={{ name: 'unit', unitId: unit.id }}
                            className="inline-flex min-h-10 items-center px-3 text-sm text-accent-900 underline"
                          >
                            {t('notebook.retryUnit')}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-500">{t('notebook.unitUnavailable')}</span>
                        )}
                        {material ? (
                          <Link
                            to={
                              material.kind === 'workbook' && !material.content.trim()
                                ? { name: 'practice', articleId: material.id }
                                : { name: 'reader', articleId: material.id }
                            }
                            className="inline-flex min-h-10 items-center px-3 text-sm text-accent-900 underline"
                          >
                            {t('notebook.openMaterial')}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-500">{t('notebook.materialUnavailable')}</span>
                        )}
                      </div>
                      {unit && material && <p className="text-xs text-ink-500">{t('notebook.retryHelp')}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {selected && (
        <MistakeExplanationSheet
          key={JSON.stringify([selected.attempt, sourceContext])}
          attempt={selected.attempt}
          onClose={() => setSelectedId(null)}
          onMissingKey={onMissingKey}
          onWord={lookup}
        />
      )}
    </>
  );
}
