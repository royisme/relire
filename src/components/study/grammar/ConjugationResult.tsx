/**
 * The result of one verb: the header (infinitive, auxiliary, rule caption, status, the "practise all tenses"
 * button), one section per tense in order, then the participles. Each tense section carries its own practise
 * button, which it shows only when a cell of that tense can be asked. Owns that composition and the status
 * wording keys. Does not own the request, the input, the drills or the per-tense and participle layout
 * (TenseSection, Participles).
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConjugationResult as Result } from '../../../services/conjugation/resolve';
import type { ConjugationAnswer } from '../../../types/conjugationAnswer';
import { hasGradableCell } from '../../../services/exercises/fromConjugation';
import { TENSES, type Tense } from '../../../types/grammarPack';
import { Button } from '../../ui/button';
import { Participles } from './Participles';
import { Patterns } from './Patterns';
import { RuleEndings } from './RuleEndings';
import { TenseSection } from './TenseSection';

type Examples = ConjugationAnswer['examples'];

/** The AI writes no example for a compound tense, so a missing key renders no example section. */
const exampleOf = (examples: Examples | undefined, tense: Tense) =>
  examples && Object.hasOwn(examples, tense) ? examples[tense as keyof Examples] : undefined;

export function ConjugationResult({
  result: { verb, examples },
  busy,
  onPractiseAll,
  onPractiseTense,
}: {
  result: Result;
  /** Which drill is being made, so its own button shows the work and no other press starts a second. */
  busy: 'all' | Tense | null;
  onPractiseAll: () => void;
  onPractiseTense: (tense: Tense) => void;
}) {
  const { t } = useTranslation();
  const all = busy === 'all';
  return (
    <article aria-label={verb.infinitive}>
      <header className="space-y-1 pb-5">
        <h3 className="break-words font-serif text-2xl font-semibold text-ink-900">{verb.infinitive}</h3>
        <p className="text-sm text-ink-700">{t(`conjugation.page.auxiliary.${verb.aux}`)}</p>
        {verb.rule && verb.rule !== 'irregular' && (
          <p className="break-words text-sm text-ink-700">{t(`conjugation.rules.${verb.rule}`)}</p>
        )}
        <p className="break-words text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{t(`conjugation.page.status.${verb.status}.label`)}</span>{' '}
          {t(`conjugation.page.status.${verb.status}.note`)}
        </p>
        {hasGradableCell(verb) && (
          <Button
            variant="outline"
            className="mt-2 w-48 max-w-full"
            disabled={busy !== null}
            aria-busy={all}
            onClick={onPractiseAll}
          >
            {all && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t(all ? 'conjugation.page.practising' : 'conjugation.page.practise')}
          </Button>
        )}
      </header>
      {TENSES.filter((tense) => Object.keys(verb.tenses[tense]).length > 0).map((tense) => (
        <TenseSection
          key={tense}
          tense={tense}
          verb={verb}
          example={exampleOf(examples, tense)}
          practising={busy === tense}
          busy={busy !== null}
          onPractise={() => onPractiseTense(tense)}
        />
      ))}
      <RuleEndings verb={verb} />
      <Patterns key={verb.infinitive} verb={verb} />
      <Participles participles={verb.participles} />
    </article>
  );
}
