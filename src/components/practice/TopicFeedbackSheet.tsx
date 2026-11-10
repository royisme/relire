/** Local authored topic feedback and storage details; never mounts lookup, AI or speech. */
import { useTranslation } from 'react-i18next';
import type { Bilingual, FeedbackMessage } from '../../types/grammarCheckpoint';
import { OverlayHeader, Sheet } from '../ui/overlay';

export function TopicFeedbackSheet({
  instruction,
  prompt,
  userAnswer,
  expectedAnswer,
  feedback,
  error,
  onClose,
}: {
  instruction?: Bilingual;
  prompt?: string;
  userAnswer?: string;
  expectedAnswer?: string;
  feedback?: FeedbackMessage;
  error?: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const title = t('grammarTopics.learning.result.feedbackTitle');
  return (
    <Sheet label={title} onClose={onClose}>
      <OverlayHeader title={title} onClose={onClose} closeLabel={t('common.close')} />
      <div className="min-h-0 space-y-4 overflow-y-auto p-5 text-sm break-words">
        {error ? (
          <p className="whitespace-pre-wrap text-bad-700">
            {t('grammarTopics.learning.errors.saveFailed', { msg: error })}
          </p>
        ) : (
          <>
            {instruction && <p>{instruction[language]}</p>}
            {prompt && (
              <p lang="fr" className="font-serif text-lg">
                {prompt}
              </p>
            )}
            {userAnswer !== undefined && (
              <p>
                {t('practice.yourAnswer')}:{' '}
                <span lang="fr" className="font-serif text-base">
                  {userAnswer}
                </span>
              </p>
            )}
            {expectedAnswer !== undefined && (
              <p>
                {t('practice.expected')}:{' '}
                <span lang="fr" className="font-serif text-base text-ok-800">
                  {expectedAnswer}
                </span>
              </p>
            )}
            {feedback && <p className="whitespace-pre-wrap">{feedback.summary[language]}</p>}
            {feedback?.detail && <p className="whitespace-pre-wrap">{feedback.detail[language]}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
