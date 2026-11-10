/** Owns the summary list and individual topic reader states; never substitutes sample content. */
import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGrammarTopics } from '../../../hooks/useGrammarTopics';
import { useTopicStudied } from '../../../hooks/useTopicStudied';
import { nextTopicEntry, orderedChapters, topicAfter } from '../../../services/grammarTopics/order';
import { errorMessage } from '../../../services/ai/errors';
import type { GrammarTopicListEntry } from '../../../types/grammarTopic';
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
  const { status, topics: summaries, topic, error, listError } = useGrammarTopics(topicId);
  const marks = useTopicStudied();
  const topics = summaries?.filter((entry) => !tag || entry.tags.includes(tag)) ?? [];
  const chapters = orderedChapters(topics);
  const next = nextTopicEntry(topics, marks.studied);

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
              to={{ name: 'practice', area: 'grammar' }}
              className="inline-flex min-h-10 items-center px-3 text-sm text-accent-900 underline"
            >
              {t('grammarTopics.learning.reference.savedPractice')}
            </Link>
          )}
        </div>
      ) : topicId ? (
        <>
          <Link
            to={{ name: 'grammar' }}
            className="mb-5 inline-flex min-h-10 items-center text-sm text-accent-900 underline underline-offset-2"
          >
            {t('grammarTopics.back')}
          </Link>
          {listError && (
            <p role="alert" className="text-sm text-bad-700">
              {t('grammarTopics.loadError', { msg: listError })}
            </p>
          )}
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
          {topic && (
            <TopicFooter
              key={topic.id}
              topicId={topic.id}
              marks={marks}
              next={summaries ? topicAfter(summaries, topic.id) : undefined}
            />
          )}
        </>
      ) : (
        <div className="space-y-5">
          <header className="flex min-h-10 flex-wrap items-center gap-3">
            <h2 className="font-serif text-2xl font-semibold">{t('grammarTopics.title')}</h2>
            {tag && (
              <Link
                to={{ name: 'grammar' }}
                aria-label={t('grammarTopics.clearTag', { tag: t(`grammarTags.${tag}`) })}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink-300 px-3 text-sm text-ink-700"
              >
                {t(`grammarTags.${tag}`)}
                <X className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </header>
          <p className="text-sm text-ink-500">{t('grammarTopics.orderNote')}</p>
          <div className="h-16 overflow-auto text-sm">
            {marks.error && (
              <p role="alert" className="text-bad-700">
                {t('grammarTopics.loadError', { msg: marks.error })}
              </p>
            )}
            {!tag &&
              topics.length > 0 &&
              !marks.error &&
              (next ? (
                <Link
                  to={{ name: 'grammarTopic', topicId: next.id }}
                  className="inline-flex min-h-10 min-w-0 items-center break-words text-accent-900 underline"
                >
                  {t('grammarTopics.next', { title: next.title[language] })}
                </Link>
              ) : (
                <p className="text-ink-500">{t('grammarTopics.allStudied')}</p>
              ))}
          </div>
          {summaries?.length === 0 ? (
            <p className="text-sm text-ink-500">{t('grammarTopics.empty')}</p>
          ) : topics.length === 0 ? (
            <p className="text-sm text-ink-500">{t('grammarTopics.noMatch')}</p>
          ) : (
            chapters.map(({ chapter, topics: chapterTopics }) => (
              <section key={chapter} className="space-y-2">
                <h3 className="font-serif text-lg font-semibold">
                  {t(`grammarTopics.chapters.${chapter}`, { defaultValue: chapter })}
                </h3>
                <ul className="divide-y divide-ink-200 border-y border-ink-200">
                  {chapterTopics.map((entry) => (
                    <li key={entry.id} className="flex min-h-10 min-w-0 items-baseline gap-3 py-1 text-sm">
                      <span className="tnum shrink-0 text-xs text-ink-500">{entry.position}</span>
                      <Link
                        to={{ name: 'grammarTopic', topicId: entry.id }}
                        className="min-h-10 min-w-0 flex-1 break-words py-2 text-accent-900 hover:underline"
                      >
                        {entry.title[language]}
                      </Link>
                      <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        <span className="text-ink-500">{t(`levels.${entry.level}`)}</span>
                        <span className="h-5 text-ok-800">
                          {marks.studied.has(entry.id) && t('grammarTopics.studied')}
                        </span>
                      </span>
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

function TopicFooter({
  topicId,
  marks,
  next,
}: {
  topicId: string;
  marks: ReturnType<typeof useTopicStudied>;
  next?: GrammarTopicListEntry;
}) {
  const { t, i18n } = useTranslation();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const studied = marks.studied.has(topicId);
  const label = t(studied ? 'grammarTopics.unmarkStudied' : 'grammarTopics.markStudied');
  async function toggle() {
    setWorking(true);
    setError(undefined);
    try {
      await (studied ? marks.unmark(topicId) : marks.mark(topicId));
    } catch (err) {
      if (live.current) setError(errorMessage(err));
    } finally {
      if (live.current) setWorking(false);
    }
  }
  return (
    <footer className="mt-6 min-w-0 space-y-2 break-words border-t border-ink-200 pt-4">
      <Button
        variant="outline"
        className="h-auto min-h-10 min-w-40 max-w-full whitespace-normal break-words"
        disabled={working}
        aria-busy={working}
        aria-label={label}
        onClick={() => toggle()}
      >
        <span className="inline-grid place-items-center">
          <span className={`col-start-1 row-start-1${working ? ' invisible' : ''}`}>
            <span className="inline-grid">
              <span className={`col-start-1 row-start-1${studied ? ' invisible' : ''}`} aria-hidden={studied}>
                {t('grammarTopics.markStudied')}
              </span>
              <span className={`col-start-1 row-start-1${studied ? '' : ' invisible'}`} aria-hidden={!studied}>
                {t('grammarTopics.unmarkStudied')}
              </span>
            </span>
          </span>
          <span className="col-start-1 row-start-1 h-4 w-4" aria-hidden="true">
            {working && <Loader2 className="h-4 w-4 animate-spin" />}
          </span>
        </span>
      </Button>
      <div className="h-20 overflow-auto text-sm text-bad-700" role="status">
        {(error ?? marks.error) && t('grammarTopics.markError', { msg: error ?? marks.error })}
      </div>
      <div className="h-16 overflow-auto text-sm">
        {next && (
          <Link
            to={{ name: 'grammarTopic', topicId: next.id }}
            className="inline-flex min-h-10 min-w-0 items-center break-words text-accent-900 underline"
          >
            {t('grammarTopics.nextTopic', { title: next.title[i18n.resolvedLanguage === 'zh' ? 'zh' : 'en'] })}
          </Link>
        )}
      </div>
    </footer>
  );
}
