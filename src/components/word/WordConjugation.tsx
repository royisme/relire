/**
 * The conjugation slot of the word sheet for a verb: for a pack verb (the lemma is exactly a pack infinitive) one
 * disclosure, "Show all tenses", over the pack's own table, with the cells the tapped word writes marked; else
 * one link to the Conjugation page. The table is closed on arrival, so the slot is the same 40px as its loading
 * line and the button never changes size. Loading and a load error take the slot's place (the real error text);
 * nothing about the verb is guessed. Loaded lazily with the pack, the engine and the page's tense section, so
 * none of them is in the main bundle. Does not own the section frame (WordDetailModal).
 */
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrammarPack } from '../../hooks/useGrammarPack';
import { verifyPackVerb } from '../../services/conjugation/verify';
import { findPackVerb } from '../../services/grammarPack/lookup';
import { reverseLookup } from '../../services/grammarPack/reverse';
import { TENSES } from '../../types/grammarPack';
import { buttonVariants } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Link } from '../shell/Link';
import { TenseSection } from '../study/grammar/TenseSection';

export function WordConjugation({ lemma, lookup }: { lemma: string; lookup: string }) {
  const { t } = useTranslation();
  const { status, pack, error } = useGrammarPack();
  const row = useMemo(() => (pack ? findPackVerb(pack, lemma) : undefined), [pack, lemma]);
  const verb = useMemo(() => (row ? verifyPackVerb(row) : undefined), [row]);
  // Only the finite cells the tapped word writes: passé composé and the participles are not in the reverse index's cells.
  const hits = useMemo(
    () => (pack && row ? reverseLookup(pack, lookup).filter((hit) => hit.verbId === row.id) : []),
    [pack, row, lookup],
  );

  if (status === 'loading') return <p className="text-sm text-ink-500">{t('wordModal.conjugationLoading')}</p>;
  if (status === 'error')
    return (
      <p role="alert" className="break-words text-sm text-bad-700">
        {error}
      </p>
    );
  if (!verb)
    return (
      <Link
        to={{ name: 'study', tab: 'grammar', verb: lemma }}
        className={buttonVariants({ variant: 'outline', className: 'w-56 max-w-full' })}
      >
        {t('wordModal.conjugateThis')}
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Link>
    );
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
        <div className="mt-2">
          {TENSES.filter((tense) => Object.keys(verb.tenses[tense]).length > 0).map((tense) => (
            <TenseSection
              key={tense}
              tense={tense}
              verb={verb}
              compact
              tapped={hits.flatMap((hit) => ('tense' in hit && hit.tense === tense ? [hit.person] : []))}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
