/** The end of a round: real counts and the way on. Owns nothing but what it shows. */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

interface SummaryProps {
  summary: { total: number; rightFirstTime: number };
  onAgain: () => void;
  onThemes: () => void;
}

export function Summary({ summary, onAgain, onThemes }: SummaryProps) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  // The round's focused control is gone, so the summary takes focus and announces its counts.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="rounded-lg border border-ink-200 bg-surface p-5">
      <h3 ref={heading} tabIndex={-1} className="font-serif text-lg font-semibold text-ink-900">
        {t('atelier.summary.title')}
      </h3>
      <p role="status" className="tnum mt-3 break-words text-ink-800">
        {summary.total > 0
          ? t('atelier.summary.count', { count: summary.total, right: summary.rightFirstTime })
          : t('atelier.summary.none')}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onAgain}>{t('atelier.summary.again')}</Button>
        <Button variant="outline" onClick={onThemes}>
          {t('atelier.summary.themes')}
        </Button>
      </div>
    </div>
  );
}
