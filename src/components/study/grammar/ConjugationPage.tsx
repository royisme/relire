/**
 * Grammar → Conjugation: one input, a compact row of the reviewed pack's verbs beside it so the common
 * case needs no typing, and a Conjugate button; the result below. The input and button never change size and the
 * result region keeps a minimum height, so a request moves nothing; a failure shows its real reason at the top of
 * that region. Pressing a practise button makes the drills in place, in a region under the result, and never
 * navigates. Owns the typed text, the prefill from `?verb=` and that region. Does not own the request
 * (hooks/useConjugation) or the result's drawing (ConjugationResult).
 */
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConjugation } from '../../../hooks/useConjugation';
import { useGrammarPack } from '../../../hooks/useGrammarPack';
import type { VocabularyWordLookup } from '../../../services/vocabulary/identity';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { ConjugationPractice } from './ConjugationPractice';

export function ConjugationPage({
  initialVerb,
  onWord,
  onMissingKey,
}: {
  initialVerb?: string;
  onWord: VocabularyWordLookup;
  onMissingKey: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState(initialVerb ?? '');
  const { working, result, error, run } = useConjugation();
  const pack = useGrammarPack();

  // The page is keyed by the address's verb, so this runs once per prefill.
  useEffect(() => {
    if (initialVerb) run(initialVerb);
  }, [initialVerb, run]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('conjugation.page.title')} subtitle={t('conjugation.page.subtitle')} />
      <form
        className="max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim()) run(typed);
        }}
      >
        <label htmlFor="conjugation-verb" className="mb-1 block text-sm text-ink-700">
          {t('conjugation.page.inputLabel')}
        </label>
        <div className="flex gap-3">
          <input
            id="conjugation-verb"
            type="text"
            lang="fr"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-ink-300 bg-surface px-3 text-sm focus:border-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-600"
          />
          <Button type="submit" className="w-36 shrink-0" disabled={!typed.trim()} aria-busy={working}>
            {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t(working ? 'conjugation.page.working' : 'conjugation.page.button')}
          </Button>
        </div>
        {/* The reviewed verbs, so the usual case is one press and no typing; the input stays for any other verb. */}
        {pack.status === 'ready' && pack.pack && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-500">{t('conjugation.page.packVerbs')}</span>
            {pack.pack.verbs.map((verb) => (
              <Button
                key={verb.id}
                type="button"
                variant="ghost"
                size="sm"
                lang="fr"
                onClick={() => {
                  setTyped(verb.infinitive);
                  run(verb.infinitive);
                }}
              >
                {verb.infinitive}
              </Button>
            ))}
          </div>
        )}
      </form>
      <div aria-busy={working} className="min-h-96">
        {error ? (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        ) : result ? (
          <ConjugationPractice
            key={result.verb.infinitive}
            result={result}
            onWord={onWord}
            onMissingKey={onMissingKey}
          />
        ) : (
          <p className="text-sm text-ink-500">{t('conjugation.page.empty')}</p>
        )}
      </div>
    </div>
  );
}
