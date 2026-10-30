/**
 * The order ticket: the meaning the learner builds, in the app language, and a tap that flips it to the
 * other language. Both texts share one cell, so the ticket is as tall as the longer and flipping moves
 * nothing. Owns what it shows.
 */
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface TicketProps {
  meaning: { zh: string; en: string };
  language: 'zh' | 'en';
  showOther: boolean;
  onToggleOther: () => void;
}

export function Ticket({ meaning, language, showOther, onToggleOther }: TicketProps) {
  const { t } = useTranslation();
  const other = language === 'zh' ? 'en' : 'zh';
  return (
    <section className="ticket relative mx-3 mb-2 shrink-0 px-4 py-2">
      {/* The punched holes of a real order slip. */}
      <span aria-hidden="true" className="absolute top-1/2 -left-2 size-4 -translate-y-1/2 rounded-full bg-ink-50" />
      <span aria-hidden="true" className="absolute top-1/2 -right-2 size-4 -translate-y-1/2 rounded-full bg-ink-50" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-600">{t('atelier.round.order')}</p>
          <div className="mt-0.5 grid">
            {(['en', 'zh'] as const).map((lang) => (
              <p
                key={lang}
                lang={lang}
                aria-hidden={(lang === language) === showOther || undefined}
                className={cn(
                  'col-start-1 row-start-1 break-words font-serif text-xl leading-[1.3]',
                  (lang === language) === showOther && 'invisible',
                )}
              >
                {meaning[lang]}
              </p>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showOther}
          onClick={onToggleOther}
          className="-mr-2 shrink-0 px-2 "
        >
          <Languages className="h-4 w-4" aria-hidden="true" />
          {t(other === 'zh' ? 'atelier.round.langZh' : 'atelier.round.langEn')}
        </Button>
      </div>
    </section>
  );
}
