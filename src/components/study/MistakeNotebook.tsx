/** The latest wrong snapshot of each item, including those later answered correctly or whose unit was removed. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { unitTitle } from '../../services/exercises/setLabel';
import { contentServiceUrl } from '../../services/grammarTopics/service';
import { TopicFeedbackSheet } from '../practice/TopicFeedbackSheet';
import { useMistakes } from '../../hooks/useMistakes';
import { GRAMMAR_AREA_IDS, GRAMMAR_TAGS, grammarAreaOf } from '../../types/grammar';
import { GrammarTagLabel } from '../GrammarTagLabel';
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
  onMissingKey: () => void;
  onWord: (word: string, sentence: string, context?: string) => void;
}

export function MistakeNotebook({ onMissingKey, onWord }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const { rows, loading, error, retry } = useMistakes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find(({ attempt }) => attempt.id === selectedId);
  const sourceContext =
    selected?.unit && !selected.attempt.topicResult
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
                  const context =
                    unit && !attempt.topicResult
                      ? [unit.instruction, unit.readingPassage?.content].filter(Boolean).join('\n')
                      : undefined;
                  const onToken = (word: string, sentence: string) => onWord(word, sentence, context);
                  return (
                    <li key={attempt.id} className="space-y-3 py-5 break-words">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-ink-600">
                          {attempt.topicResult ? (
                            t(`grammarTags.${attempt.grammarTag}`)
                          ) : (
                            <GrammarTagLabel tag={attempt.grammarTag} />
                          )}
                        </span>
                        <span className={resolved ? 'text-ok-800' : 'text-bad-700'}>
                          {t(resolved ? 'notebook.resolved' : 'notebook.unresolved')}
                        </span>
                      </div>
                      <p className="font-serif text-lg text-ink-900">
                        {attempt.topicResult ? attempt.prompt : <LookupText text={attempt.prompt} onWord={onToken} />}
                      </p>
                      <p className="text-sm">
                        <span className="text-ink-600">{t('practice.yourAnswer')}: </span>
                        <span className="font-serif text-base text-bad-700 line-through">
                          {attempt.topicResult ? (
                            attempt.userAnswer
                          ) : (
                            <LookupText text={attempt.userAnswer} onWord={onToken} />
                          )}
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="text-ink-600">{t('practice.expected')}: </span>
                        <span className="font-serif text-base text-ok-800">
                          {attempt.topicResult ? (
                            attempt.expectedAnswer
                          ) : (
                            <LookupText text={attempt.expectedAnswer} onWord={onToken} />
                          )}
                        </span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => setSelectedId(attempt.id)}>
                          {t(attempt.topicResult ? 'grammarTopics.learning.result.readFeedback' : 'practice.explain')}
                        </Button>
                        {unit ? (
                          <Link
                            to={{ name: 'unit', unitId: unit.id }}
                            className="inline-flex min-h-10 items-center px-3 text-sm text-accent-900 underline"
                          >
                            {t('notebook.retryUnit')}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-500">{t('notebook.unitUnavailable')}</span>
                        )}
                      </div>
                      {unit?.topicOrigin && <p className="text-xs text-ink-500">{unitTitle(unit, language)}</p>}
                      {attempt.topicResult && (
                        <p className="text-xs text-ink-500">
                          {t('grammarTopics.learning.practice.revision', {
                            revision: attempt.topicResult.exerciseRevision.slice(0, 8),
                          })}
                        </p>
                      )}
                      {attempt.topicResult && contentServiceUrl() && (
                        <Link
                          to={{ name: 'grammarTopic', topicId: attempt.topicResult.topicId }}
                          className="inline-flex min-h-10 items-center text-sm text-accent-900 underline"
                        >
                          {t('grammarTopics.learning.reference.openCurrent')}
                        </Link>
                      )}
                      {unit && <p className="text-xs text-ink-500">{t('notebook.retryHelp')}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {selected?.attempt.topicResult ? (
        <TopicFeedbackSheet
          instruction={selected.attempt.topicResult.instruction}
          prompt={selected.attempt.prompt}
          userAnswer={selected.attempt.userAnswer}
          expectedAnswer={selected.attempt.expectedAnswer}
          feedback={selected.attempt.topicResult.feedback}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        selected && (
          <MistakeExplanationSheet
            key={JSON.stringify([selected.attempt, sourceContext])}
            attempt={selected.attempt}
            onClose={() => setSelectedId(null)}
            onMissingKey={onMissingKey}
            onWord={lookup}
          />
        )
      )}
    </>
  );
}
