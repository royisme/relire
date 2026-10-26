/** Owns Today's loading boundary using App's shared vocabulary model, not checklist selection or persistence. */
import { useTranslation } from 'react-i18next';
import { useToday } from '../../hooks/useToday';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { PageHeader } from '../ui/page-header';
import { TodayView } from './TodayView';

export function TodayPage({ vocabulary }: { vocabulary: VocabularyModel }) {
  const { t } = useTranslation();
  const today = useToday(vocabulary);
  return today.status === 'loading' ? (
    <section
      role="status"
      className="mx-auto max-w-5xl min-w-0 min-h-[40rem] px-4 py-6 sm:px-6 space-y-3 text-sm text-ink-600 break-words"
    >
      <PageHeader title={t('today.title')} />
      <p>{t('today.loading')}</p>
    </section>
  ) : (
    <TodayView plan={today.plan} now={today.now} />
  );
}
