/**
 * My study → Grammar → Conjugation: one input and a Conjugate button, and the result below. The input and
 * button never change size and the result region keeps a minimum height, so a request moves nothing; a failure
 * shows its real reason at the top of that region. Owns the typed text and the prefill from `?verb=`. Does not
 * own the request (hooks/useConjugation) or the result's drawing (ConjugationResult).
 */
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConjugation } from '../../../hooks/useConjugation';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { ConjugationResult } from './ConjugationResult';

export function ConjugationPage({ initialVerb }: { initialVerb?: string }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState(initialVerb ?? '');
  const { working, result, error, run } = useConjugation();

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
      </form>
      <div aria-busy={working} className="min-h-96">
        {error ? (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        ) : result ? (
          <ConjugationResult result={result} />
        ) : (
          <p className="text-sm text-ink-500">{t('conjugation.page.empty')}</p>
        )}
      </div>
    </div>
  );
}
