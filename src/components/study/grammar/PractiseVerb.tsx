/**
 * "Practise this verb" under the verb's header: one outline button that makes a drill set (all seven tenses, the
 * default level and size) from the cells that can be asked, with no AI. The button has a fixed width and shows
 * its working state itself; below it a status line of fixed height holds the real error or, once saved, the link
 * to the new set, so nothing moves. Owns that button and its status. Does not own the drills (fromConjugation),
 * the saving and its retry (useUnitSaver) or the page.
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGrammarPack } from '../../../hooks/useGrammarPack';
import { useUnitSaver } from '../../../hooks/useUnitSaver';
import type { VerifiedVerb } from '../../../services/conjugation/verify';
import {
  DEFAULT_DRILL_COUNT,
  DEFAULT_DRILL_LEVEL,
  hasGradableCell,
  prepareConjugationDrills,
} from '../../../services/exercises/fromConjugation';
import { TENSES } from '../../../types/grammarPack';
import { Link } from '../../shell/Link';
import { Button } from '../../ui/button';

/** The page keys this by the verb, so a new verb starts with a fresh status and no leftover payload. */
export function PractiseVerb({ verb }: { verb: VerifiedVerb }) {
  const { t } = useTranslation();
  const { status, save } = useUnitSaver();
  // The page has read the pack to answer a pack verb, so it is ready by the time the button is pressed.
  const pack = useGrammarPack();
  if (!hasGradableCell(verb)) return null;
  const working = status.kind === 'working';
  return (
    <div className="pt-3">
      <Button
        variant="outline"
        className="w-48 max-w-full"
        disabled={working}
        aria-busy={working}
        onClick={() =>
          void save(() =>
            prepareConjugationDrills({
              verbs: [verb],
              tenses: [...TENSES],
              level: DEFAULT_DRILL_LEVEL,
              perUnit: DEFAULT_DRILL_COUNT,
              packVersion: verb.status === 'pack-reviewed' ? pack.pack?.packVersion : undefined,
              t,
            }),
          )
        }
      >
        {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t(working ? 'conjugation.page.practising' : 'conjugation.page.practise')}
      </Button>
      <div className="mt-1 min-h-10 text-sm" aria-live="polite">
        {status.kind === 'error' && (
          <p role="alert" className="break-words text-bad-700">
            {status.message}
          </p>
        )}
        {status.kind === 'done' && (
          <Link
            to={{ name: 'practiceSet', area: 'grammar', setId: status.units[0].setId }}
            className="inline-flex min-h-10 items-center text-accent-800 underline underline-offset-2"
          >
            {t('conjugation.page.practiseOpen')}
          </Link>
        )}
      </div>
    </div>
  );
}
