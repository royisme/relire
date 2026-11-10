/** Owns Today's date, plan guidance and independent practice links, not loading or activity selection. */
import { useTranslation } from 'react-i18next';
import type { TodayPlan } from '../../services/today/plan';
import type { Route } from '../../utils/routes';
import { Link } from '../shell/Link';
import { buttonVariants } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { TodayAside } from './TodayAside';
import { TodayCard } from './TodayCard';

export function TodayView({ plan, now }: { plan: TodayPlan; now: number }) {
  const { t, i18n } = useTranslation();
  const clauses = plan.steps.flatMap((step) => {
    if (step.done || 'error' in step) return [];
    if (step.id === 'words') return [t('today.guidance.words', { count: step.due + step.newAvailable })];
    if (step.id === 'mistakes') return [t('today.guidance.mistakes', { count: step.unresolved })];
    return [t(`today.guidance.${step.id}`)];
  });
  const practice: { id: string; to: Route }[] = [
    { id: 'words', to: { name: 'words' } },
    { id: 'read', to: { name: 'library' } },
    { id: 'speaking', to: { name: 'speaking' } },
    { id: 'grammar', to: { name: 'grammar' } },
  ];
  return (
    <section className="mx-auto max-w-5xl min-w-0 min-h-[40rem] px-4 py-6 sm:px-6 space-y-6 break-words">
      <header className="space-y-3">
        <PageHeader
          title={t('today.title')}
          subtitle={new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(now)}
        />
        <p className="max-w-prose text-sm text-ink-700">
          {plan.steps.length === 0 && t('today.guidance.empty')}
          {plan.allDone && t('today.guidance.allDone')}
          {plan.steps.length > 0 &&
            !plan.allDone &&
            (plan.nextIndex === undefined
              ? t('today.guidance.unavailable')
              : t('today.guidance.plan', {
                  steps: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(clauses),
                }))}
        </p>
      </header>
      <div className="grid min-w-0 gap-8 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          <TodayCard plan={plan} />
          <nav aria-label={t('today.practice.title')} className="space-y-2">
            <p className="text-sm text-ink-600">{t('today.practice.title')}</p>
            <div className="flex flex-wrap gap-2">
              {practice.map((link) => (
                <Link key={link.id} to={link.to} className={buttonVariants({ variant: 'outline' })}>
                  {t(`today.practice.${link.id}`)}
                </Link>
              ))}
            </div>
          </nav>
        </div>
        <TodayAside counts={plan.counts} />
      </div>
    </section>
  );
}
