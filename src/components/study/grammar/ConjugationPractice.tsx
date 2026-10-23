/**
 * The Conjugation page's drills for the verb on screen: the result, then a bordered region under it that holds the
 * saved exercise set's own sheet (`UnitSheet`) with previous/next when the set has one unit per tense. Each tense's
 * section makes its own small drill, the header makes all tenses at once, and nothing navigates: the sheet is drawn
 * in place, and the link to the set in Practice stays available. Owns the saving (`useUnitSaver`), the open unit and
 * the region. Does not own the request, the result's drawing (ConjugationResult) or the sheet's state
 * (`useExerciseUnit`). Keyed by the infinitive, so a new verb starts with no leftover batch.
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExerciseUnit } from '../../../hooks/useExerciseUnit';
import { useGrammarPack } from '../../../hooks/useGrammarPack';
import { useUnitSaver } from '../../../hooks/useUnitSaver';
import type { ConjugationResult as Result } from '../../../services/conjugation/resolve';
import { DEFAULT_DRILL_LEVEL, prepareConjugationDrills } from '../../../services/exercises/fromConjugation';
import type { VocabularyWordLookup } from '../../../services/vocabulary/identity';
import type { ExerciseUnit } from '../../../types/exercises';
import { TENSES, type Tense } from '../../../types/grammarPack';
import { UnitSheet } from '../../practice/UnitSheet';
import { Link } from '../../shell/Link';
import { Button } from '../../ui/button';
import { ConjugationResult } from './ConjugationResult';

/** A short drill: one verb's six persons of one tense, and a few of them for all tenses. */
const DRILL_ITEMS = 6;

interface Props {
  result: Result;
  onWord: VocabularyWordLookup;
  onMissingKey: () => void;
}

/** One saved unit's sheet, read through its own session so answers and attempts are the real ones. */
function UnitDrill({
  unit,
  onWord,
  onMissingKey,
}: {
  unit: ExerciseUnit;
  onWord: VocabularyWordLookup;
  onMissingKey: () => void;
}) {
  const { t } = useTranslation();
  const session = useExerciseUnit(unit.id, { onMissingKey });
  if (session.status === 'error')
    return (
      <p role="alert" className="break-words text-sm text-bad-700">
        {session.loadError}
      </p>
    );
  if (session.status === 'missing') return <p className="text-sm text-ink-600">{t('notFound.unit')}</p>;
  if (!session.unit) return <div aria-busy="true" className="min-h-64" />;
  return <UnitSheet unit={session.unit} session={session} onWord={onWord} />;
}

export function ConjugationPractice({ result, onWord, onMissingKey }: Props) {
  const { t } = useTranslation();
  const pack = useGrammarPack();
  const { status, save, drop } = useUnitSaver();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<'all' | Tense | null>(null);
  const { verb } = result;
  const units = status.kind === 'done' ? status.units : [];

  const make = async (tenses: Tense[], which: 'all' | Tense) => {
    // A failed save keeps its payload, so drop it: the press must make the tense the learner just pressed.
    drop();
    setBusy(which);
    const saved = await save(() =>
      prepareConjugationDrills({
        verbs: [verb],
        tenses,
        level: DEFAULT_DRILL_LEVEL,
        perUnit: DRILL_ITEMS,
        maxPerVerb: DRILL_ITEMS,
        packVersion: verb.status === 'pack-reviewed' ? pack.pack?.packVersion : undefined,
        t,
      }),
    );
    setBusy(null);
    if (saved) setIndex(0);
  };

  const unit = units[Math.min(index, units.length - 1)];
  return (
    <>
      <ConjugationResult
        result={result}
        busy={busy}
        onPractiseAll={() => void make([...TENSES], 'all')}
        onPractiseTense={(tense) => void make([tense], tense)}
      />
      {(unit || status.kind === 'working' || status.kind === 'error') && (
        <section
          aria-label={t('conjugation.page.practiseTitle')}
          aria-busy={status.kind === 'working'}
          className="mt-5 min-h-96 rounded-lg border border-ink-200 bg-surface px-4 py-5 sm:px-6"
        >
          <div className="min-h-10 text-sm" aria-live="polite">
            {status.kind === 'working' && <p className="text-ink-600">{t('conjugation.page.practising')}</p>}
            {status.kind === 'error' && (
              <p role="alert" className="break-words text-bad-700">
                {status.message}
              </p>
            )}
            {status.kind === 'done' && (
              <p className="text-ink-700">
                {t('conjugation.drill.made', {
                  count: status.units.reduce((sum, saved) => sum + saved.items.length, 0),
                })}
              </p>
            )}
          </div>
          {unit && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {units.length > 1 && (
                  <>
                    <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      <span>{t('conjugation.page.practisePrevious')}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index >= units.length - 1}
                      onClick={() => setIndex(index + 1)}
                    >
                      <span>{t('conjugation.page.practiseNext')}</span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
                <Link
                  to={{ name: 'practiceSet', area: 'grammar', setId: unit.setId }}
                  className="inline-flex min-h-10 items-center text-sm text-accent-800 underline underline-offset-2"
                >
                  {t('conjugation.page.practiseOpen')}
                </Link>
              </div>
              <UnitDrill key={unit.id} unit={unit} onWord={onWord} onMissingKey={onMissingKey} />
            </>
          )}
        </section>
      )}
    </>
  );
}
