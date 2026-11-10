/**
 * The "Show all tenses" disclosure of the word sheet's conjugation slot: a fixed-size button over content that is
 * closed on arrival, so the slot is the same 40px as its loading line and the button never changes size. Owns
 * that frame only, not the tenses inside it.
 */
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

export function TensesDisclosure({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Collapsible>
      <CollapsibleTrigger
        className={buttonVariants({ variant: 'outline', className: 'group w-52 max-w-full justify-between' })}
      >
        <span className="group-data-[panel-open]:hidden">{t('wordModal.showTenses')}</span>
        <span className="hidden group-data-[panel-open]:inline">{t('wordModal.hideTenses')}</span>
        <ChevronDown className="h-4 w-4 shrink-0 group-data-[panel-open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
