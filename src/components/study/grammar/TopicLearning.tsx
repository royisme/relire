/** Prepares one revision outside render, then owns its read-only bootstrap and single exercise session. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExerciseUnit } from '../../../hooks/useExerciseUnit';
import { topicExerciseRevision, topicToExerciseUnit } from '../../../services/grammarTopics/checkpoints';
import { errorMessage } from '../../../services/ai/errors';
import type { GrammarTopic } from '../../../types/grammarTopic';
import type { ExerciseUnit } from '../../../types/exercises';
import { TopicWorkbench } from '../../practice/TopicWorkbench';
import { Link } from '../../shell/Link';
import { NotFoundView } from '../../shell/NotFoundView';
import { Button } from '../../ui/button';
import { TopicBlocks } from './TopicBlocks';

function PreparedTopicLearning({ topic, preparedUnit }: { topic: GrammarTopic; preparedUnit: ExerciseUnit }) {
  const { t, i18n } = useTranslation();
  const session = useExerciseUnit(preparedUnit.id, { preparedUnit, onMissingKey: () => {} });
  if (session.status === 'missing') return <NotFoundView reason="unit" />;
  if (session.status === 'error')
    return (
      <div className="space-y-4">
        <p role="alert" className="text-bad-700">
          {t('grammarTopics.learning.errors.loadSavedFailed', { msg: session.loadError })}
        </p>
        <Button variant="outline" onClick={session.reload}>
          {t('common.retry')}
        </Button>
        <TopicBlocks blocks={topic.blocks} language={i18n.resolvedLanguage === 'zh' ? 'zh' : 'en'} />
      </div>
    );
  if (!session.unit) return <div className="min-h-64" aria-busy="true" />;
  return <TopicWorkbench session={session} topic={topic} />;
}

export function TopicLearning({ topic }: { topic: GrammarTopic }) {
  const { t, i18n } = useTranslation();
  const [prepared, setPrepared] = useState<ExerciseUnit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    const createdAt = Date.now();
    void topicExerciseRevision(topic)
      .then((revision) => topicToExerciseUnit(topic, revision, createdAt))
      .then(
        (unit) => {
          if (live) setPrepared(unit);
        },
        (err: unknown) => {
          if (live) setError(errorMessage(err));
        },
      );
    return () => {
      live = false;
    };
  }, [topic, retry]);
  if (error)
    return (
      <div className="space-y-4">
        <p role="alert" className="text-bad-700">
          {t('grammarTopics.learning.errors.prepareFailed', { msg: error })}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setError(null);
            setRetry((value) => value + 1);
          }}
        >
          {t('common.retry')}
        </Button>
        <Link to={{ name: 'practice' }} className="inline-flex min-h-10 items-center text-accent-900 underline">
          {t('grammarTopics.learning.reference.savedPractice')}
        </Link>
        <TopicBlocks blocks={topic.blocks} language={i18n.resolvedLanguage === 'zh' ? 'zh' : 'en'} />
      </div>
    );
  if (!prepared) return <div className="min-h-64" aria-busy="true" />;
  return <PreparedTopicLearning key={prepared.id} topic={topic} preparedUnit={prepared} />;
}
