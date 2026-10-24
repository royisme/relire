/** Owns the Today checklist's headings, statuses and destination links, not loading or stored activity. */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { TodayPlan, TodayStep } from '../../services/today/plan';
import type { Route } from '../../utils/routes';
import { cn } from '../../lib/utils';
import { Link } from '../shell/Link';
import { buttonVariants } from '../ui/button';

function stepContent(step: Exclude<TodayStep, { error: string }>, t: TFunction): { to: Route; status: string } {
  switch (step.id) {
    case 'words':
      return {
        to: { name: 'wordsReview' },
        status: t('today.words.status', { due: step.due, newAvailable: step.newAvailable }),
      };
    case 'read':
      return {
        to: { name: 'gradedReader', readerId: step.readerId, ...(step.version ? { version: step.version } : {}) },
        status: t(`today.read.${step.state}`, { order: step.order }),
      };
    case 'sound':
      return { to: { name: 'speaking' }, status: t('today.sound.status') };
    case 'mistakes':
      return { to: { name: 'study', tab: 'mistakes' }, status: t('today.mistakes.status', { count: step.unresolved }) };
    case 'grammar':
      return {
        to: { name: 'grammarTopic', topicId: step.topicId },
        status: t('today.grammar.status', { title: step.title }),
      };
  }
}

export function TodayView({ plan }: { plan: TodayPlan }) {
  const { t } = useTranslation();
  const firstPending = plan.steps.find((step) => !step.done);
  return (
    <section className="mx-auto max-w-3xl min-w-0 min-h-[40rem] px-4 py-6 sm:px-6 space-y-4 break-words">
      <h1 className="font-serif text-2xl font-semibold">{t('today.title')}</h1>
      <p className="text-sm text-ink-600">{t('today.intro')}</p>
      <ol className="divide-y divide-ink-200 border-y border-ink-200">
        {plan.steps.map((step) => {
          const content =
            'error' in step ? { status: t('today.stepError', { msg: step.error }), to: null } : stepContent(step, t);
          return (
            <li key={step.id} className="min-w-0 py-4 space-y-2">
              <h2 className="font-serif text-lg font-semibold">{t(`today.${step.id}.title`)}</h2>
              <p className={cn('text-sm', 'error' in step ? 'text-bad-700' : 'text-ink-700')}>
                {content.status}
                {step.done && <span className="block text-ok-800">{t('today.done')}</span>}
              </p>
              {content.to && (
                <Link
                  to={content.to}
                  className={cn(
                    buttonVariants({ variant: step === firstPending ? 'default' : 'outline' }),
                    'h-auto min-h-10 max-w-full whitespace-normal break-words py-2',
                  )}
                >
                  {t(`today.${step.id}.action`)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {plan.allDone && <p className="text-sm text-ink-700">{t('today.allDone')}</p>}
    </section>
  );
}
