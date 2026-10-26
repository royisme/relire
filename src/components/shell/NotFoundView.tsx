/** What an unknown address or a missing article or unit shows: what happened and the way back. */
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '../ui/button';
import { Link } from './Link';

import type { LearningArea } from '../../types/learningArea';
export function NotFoundView({
  reason,
  area,
}: {
  reason: 'page' | 'article' | 'unit' | 'set' | 'passage' | 'grammarTopic' | 'gradedReader';
  area?: LearningArea;
}) {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
      <h2 className="font-serif text-2xl font-semibold text-ink-900">{t('notFound.title')}</h2>
      <p className="text-sm text-ink-500 break-words">{t(`notFound.${reason}`)}</p>
      {area ? (
        <Link to={{ name: 'practice', area }} className={buttonVariants()}>
          {t('notFound.toPractice')}
        </Link>
      ) : (
        <Link to={{ name: 'library' }} className={buttonVariants()}>
          {t('notFound.toLibrary')}
        </Link>
      )}
    </div>
  );
}
