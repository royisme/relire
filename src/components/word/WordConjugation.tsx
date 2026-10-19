/**
 * The conjugation slot of the word sheet for a verb: the pack's own table when the lemma is exactly a pack
 * infinitive, else one link to the Conjugation page. Loading and a load error take the slot's place (the real
 * error text); nothing about the verb is guessed. Loaded lazily with the pack, the engine and the page's tense
 * section, so none of them is in the main bundle. Does not own the section frame (WordDetailModal).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrammarPack } from '../../hooks/useGrammarPack';
import { verifyPackVerb } from '../../services/conjugation/verify';
import { findPackVerb } from '../../services/grammarPack/lookup';
import { TENSES } from '../../types/grammarPack';
import { buttonVariants } from '../ui/button';
import { Link } from '../shell/Link';
import { TenseSection } from '../study/grammar/TenseSection';

export function WordConjugation({ lemma }: { lemma: string }) {
  const { t } = useTranslation();
  const { status, pack, error } = useGrammarPack();
  const row = useMemo(() => (pack ? findPackVerb(pack, lemma) : undefined), [pack, lemma]);
  const verb = useMemo(() => (row ? verifyPackVerb(row) : undefined), [row]);

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
        className={buttonVariants({ variant: 'outline', className: 'max-w-full whitespace-normal text-center' })}
      >
        {t('wordModal.conjugateThis')}
      </Link>
    );
  return (
    <div className="-mt-2">
      {TENSES.filter((tense) => Object.keys(verb.tenses[tense]).length > 0).map((tense) => (
        <TenseSection key={tense} tense={tense} verb={verb} compact />
      ))}
    </div>
  );
}
