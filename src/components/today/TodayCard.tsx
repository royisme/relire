/** Owns Today's ordered step rows and their destination links, not plan selection or stored activity. */
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { TodayPlan, TodayStep } from '../../services/today/plan';
import type { Route } from '../../utils/routes';
import { cn } from '../../lib/utils';
import { Link } from '../shell/Link';
import { buttonVariants } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';

export function TodayCard({ plan }: { plan: TodayPlan }) {
  const { t } = useTranslation();
  return (
    <Card aria-labelledby="today-steps">
      <CardHeader className="flex-wrap">
        <h3 id="today-steps" className="font-serif text-lg font-semibold text-ink-900">
          {t('today.steps.title')}
        </h3>
        {plan.steps.length > 0 && (
          <p className="tnum text-xs text-ink-500">
            {t('today.steps.progress', { done: plan.doneCount, total: plan.steps.length })}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ol className="divide-y divide-ink-200">
          {plan.steps.map((step, index) => {
            const row = { step, index, next: index === plan.nextIndex, last: index === plan.steps.length - 1 };
            if ('error' in step)
              return <TodayRow key={step.id} {...row} status={t('today.stepError', { msg: step.error })} />;
            switch (step.id) {
              case 'words':
                return (
                  <TodayRow
                    key={step.id}
                    {...row}
                    to={{ name: 'wordsReview' }}
                    status={t('today.words.status', { due: step.due, newAvailable: step.newAvailable })}
                  />
                );
              case 'read':
                return (
                  <TodayRow
                    key={step.id}
                    {...row}
                    to={{
                      name: 'gradedReader',
                      readerId: step.readerId,
                      ...(step.version ? { version: step.version } : {}),
                    }}
                    status={
                      step.order === 1 && step.state === 'start'
                        ? t('today.read.startNoKey', { order: step.order })
                        : t(`today.read.${step.state}`, { order: step.order })
                    }
                  />
                );
              case 'sound':
                return <TodayRow key={step.id} {...row} to={{ name: 'speaking' }} status={t('today.sound.status')} />;
              case 'mistakes':
                return (
                  <TodayRow
                    key={step.id}
                    {...row}
                    to={{ name: 'study', tab: 'mistakes' }}
                    status={t('today.mistakes.status', { count: step.unresolved })}
                  />
                );
              case 'grammar':
                return (
                  <TodayRow
                    key={step.id}
                    {...row}
                    to={{ name: 'grammarTopic', topicId: step.topicId }}
                    status={t('today.grammar.status', { title: step.title })}
                  />
                );
            }
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function TodayRow({
  step,
  index,
  next,
  last,
  to,
  status,
}: {
  step: TodayStep;
  index: number;
  next: boolean;
  last: boolean;
  to?: Route;
  status: string;
}) {
  const { t } = useTranslation();
  const layout = 'relative grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-5';
  const content = (
    <>
      <span
        className={cn(
          'relative z-10 flex h-6 items-center justify-center bg-surface text-sm tnum',
          next && 'text-accent-900',
        )}
      >
        {step.done ? <Check className="h-4 w-4 text-ok-800" aria-hidden="true" /> : index + 1}
        {step.done && <span className="sr-only">{t('today.done')}</span>}
      </span>
      <div className="min-w-0 space-y-2">
        <h4 className={cn('font-serif font-semibold', next ? 'text-2xl leading-tight text-ink-900' : 'text-lg')}>
          {step.id === 'read' && 'title' in step ? step.title : t(`today.${step.id}.title`)}
        </h4>
        <p className={cn('text-sm tnum', 'error' in step && 'text-bad-700')}>{status}</p>
        {next && to && (
          <>
            <p className="text-sm text-ink-600">{t(`today.${step.id}.why`)}</p>
            <Link to={to} className={cn(buttonVariants({ size: 'lg' }), 'max-w-full')}>
              {t(`today.${step.id}.action`)}
            </Link>
          </>
        )}
      </div>
    </>
  );
  return (
    <li className={cn('relative min-w-0', step.done ? 'text-ink-500' : 'text-ink-700')}>
      {!last && <span aria-hidden="true" className="absolute left-3 top-6 -bottom-6 border-l border-ink-200" />}
      {to && !next ? (
        <Link to={to} className={cn(layout, 'hover:text-ink-900')}>
          {content}
        </Link>
      ) : (
        <div className={layout}>{content}</div>
      )}
    </li>
  );
}
