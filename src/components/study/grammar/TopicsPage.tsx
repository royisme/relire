/** Owns the summary list and individual topic reader states; never substitutes sample content. */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGrammarTopics } from '../../../hooks/useGrammarTopics';
import type { GrammarTag } from '../../../types/grammar';
import { Link } from '../../shell/Link';
import { NotFoundView } from '../../shell/NotFoundView';
import { TopicBlocks } from './TopicBlocks';
import { TopicLearning } from './TopicLearning';
import { Button } from '../../ui/button';

export default function TopicsPage(props: { topicId?: string; tag?: GrammarTag }) {
  const [retry, setRetry] = useState(0);
  return (
    <TopicsContent key={`${props.topicId ?? ''}:${retry}`} {...props} onRetry={() => setRetry((value) => value + 1)} />
  );
}

function TopicsContent({ topicId, tag, onRetry }: { topicId?: string; tag?: GrammarTag; onRetry: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const { status, topics: summaries, topic, error } = useGrammarTopics(topicId);
  const topics = summaries?.filter((entry) => !tag || entry.tags.includes(tag)) ?? [];
  const chapters = [...new Set(topics.map((entry) => entry.chapter))];

  return (
    <div data-grammar-topics className="min-w-0 break-words" aria-busy={status === 'loading'}>
      {status === 'loading' ? (
        <p role="status" className="text-sm text-ink-500">
          {t('grammarTopics.loading')}
        </p>
      ) : status === 'error' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-bad-700">
            {t('grammarTopics.loadError', { msg: error })}
          </p>
          <Button variant="outline" onClick={onRetry}>
            {t('common.retry')}
          </Button>
          {topicId && (
            <Link
              to={{ name: 'practice' }}
              className="inline-flex min-h-10 items-center px-3 text-sm text-accent-900 underline"
            >
              {t('grammarTopics.learning.reference.savedPractice')}
            </Link>
          )}
        </div>
      ) : topicId ? (
        <>
          <Link
            to={{ name: 'study', tab: 'grammar' }}
            className="mb-5 inline-flex min-h-10 items-center text-sm text-accent-900 underline underline-offset-2"
          >
            {t('grammarTopics.back')}
          </Link>
          {topic?.learning ? (
            <TopicLearning key={topic.id} topic={topic} />
          ) : topic ? (
            <article lang={language} className="min-w-0 space-y-6 text-sm leading-relaxed">
              <header className="max-w-prose space-y-2">
                <h2 className="font-serif text-2xl font-semibold text-balance">{topic.title[language]}</h2>
                <p className="text-xs text-ink-500">{t(`levels.${topic.level}`)}</p>
              </header>
              <TopicBlocks blocks={topic.blocks} language={language} />
            </article>
          ) : (
            <NotFoundView reason="grammarTopic" />
          )}
        </>
      ) : (
        <div className="space-y-5">
          <header className="flex min-h-10 flex-wrap items-center gap-3">
            <h2 className="font-serif text-2xl font-semibold">{t('grammarTopics.title')}</h2>
            {tag && (
              <Link
                to={{ name: 'study', tab: 'grammar' }}
                aria-label={t('grammarTopics.clearTag', { tag: t(`grammarTags.${tag}`) })}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink-300 px-3 text-sm text-ink-700"
              >
                {t(`grammarTags.${tag}`)}
                <X className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </header>
          {summaries?.length === 0 ? (
            <p className="text-sm text-ink-500">{t('grammarTopics.empty')}</p>
          ) : topics.length === 0 ? (
            <p className="text-sm text-ink-500">{t('grammarTopics.noMatch')}</p>
          ) : (
            chapters.map((chapter) => (
              <section key={chapter} className="space-y-2">
                <h3 className="font-serif text-lg font-semibold">
                  {t(`grammarTopics.chapters.${chapter}`, { defaultValue: chapter })}
                </h3>
                <ul className="divide-y divide-ink-200 border-y border-ink-200">
                  {topics
                    .filter((entry) => entry.chapter === chapter)
                    .map((entry) => (
                      <li key={entry.id}>
                        <Link
                          to={{ name: 'grammarTopic', topicId: entry.id }}
                          className="flex min-h-10 items-center justify-between gap-4 py-3 text-sm text-accent-900 hover:underline"
                        >
                          <span>{entry.title[language]}</span>
                          <span className="shrink-0 text-xs text-ink-500">{t(`levels.${entry.level}`)}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
