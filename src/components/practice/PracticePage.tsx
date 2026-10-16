/**
 * `#/practice`: pick an article, make a new set from it, see its exercise units
 * with the learner's real progress, or read a sentence aloud for a score (the
 * open oral assessment). The form sits above the list, so new units grow the
 * list downwards and never move the button that made them. The data comes from
 * `useMaterialUnits` and the generating from `GenerateForm`.
 */
import { useTranslation } from 'react-i18next';
import { useMaterialUnits } from '../../hooks/useMaterialUnits';
import { navigate } from '../../hooks/useRoute';
import type { Article, PronunciationAssessment } from '../../types';
import { cleanArticleTitle } from '../../utils/i18nHelpers';
import { NotFoundView } from '../shell/NotFoundView';
import { Link } from '../shell/Link';
import { buttonVariants } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { GenerateForm } from './GenerateForm';
import { OralPractice } from './OralPractice';
import { UnitList } from './UnitList';

interface PracticePageProps {
  articles: Article[];
  /** The article from the address; null only when the library is empty. */
  articleId: string | null;
  onMissingKey: () => void;
  onAssessed: (assessment: PronunciationAssessment, sentence: string) => void;
}

const selectClass =
  'h-10 w-full max-w-sm cursor-pointer rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900 focus:border-accent-600 focus:outline-none';

export function PracticePage({ articles, articleId, onMissingKey, onAssessed }: PracticePageProps) {
  const { t } = useTranslation();
  const article = articles.find((candidate) => candidate.id === articleId) ?? null;
  const { rows, loading, error } = useMaterialUnits(article?.id ?? null);

  if (articles.length === 0)
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-center sm:px-6">
        <p className="font-serif text-lg text-ink-900">{t('practice.noArticleTitle')}</p>
        <p className="text-sm text-ink-500">{t('practice.noArticleDesc')}</p>
        <Link to={{ name: 'library' }} className={buttonVariants()}>
          {t('practice.openLibrary')}
        </Link>
      </div>
    );
  if (!article) return <NotFoundView reason="article" />;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader title={t('practice.title')} subtitle={t('practice.subtitle')} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.article')}</span>
        <select
          value={article.id}
          onChange={(event) => navigate({ name: 'practice', articleId: event.target.value })}
          className={selectClass}
        >
          {articles.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {cleanArticleTitle(candidate.title)}
            </option>
          ))}
        </select>
      </label>

      <section aria-labelledby="practice-units" className="space-y-4">
        <div>
          <h3 id="practice-units" className="font-serif text-lg font-semibold text-ink-900">
            {t('practice.unitsTitle')}
          </h3>
          <p className="text-sm text-ink-500">{t('practice.unitsDesc')}</p>
        </div>
        <GenerateForm key={article.id} article={article} onMissingKey={onMissingKey} />
        {error && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        )}
        {loading ? (
          <div aria-busy="true" className="min-h-12" />
        ) : rows.length > 0 ? (
          <UnitList rows={rows} />
        ) : (
          !error && <p className="text-sm text-ink-600">{t('practice.noUnits')}</p>
        )}
      </section>

      <section aria-labelledby="practice-oral" className="space-y-4">
        <div>
          <h3 id="practice-oral" className="font-serif text-lg font-semibold text-ink-900">
            {t('practice.oralTitle')}
          </h3>
          <p className="text-sm text-ink-500">{t('practice.oralDesc')}</p>
        </div>
        <OralPractice key={article.id} article={article} onAssessed={onAssessed} />
      </section>
    </div>
  );
}
