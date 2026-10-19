/**
 * One tense of the result: its name, when it is used, how it is formed, the persons as dictionary rows and the
 * AI's example sentence when there is one. `compact` is the word sheet's form: no use and form lines, tighter
 * rows. Owns that section only. Does not own the verb header, the participles or any request.
 */
import { useTranslation } from 'react-i18next';
import type { CheckedCell, VerifiedVerb } from '../../../services/conjugation/verify';
import type { ConjugationAnswer } from '../../../types/conjugationAnswer';
import type { Person, Tense } from '../../../types/grammarPack';
import { ComparedLines } from './ComparedLines';
import { cellText, ruleText } from './forms';

interface Props {
  tense: Tense;
  verb: VerifiedVerb;
  example?: ConjugationAnswer['examples'][Tense];
  compact?: boolean;
}

export function TenseSection({ tense, verb, example, compact }: Props) {
  const { t } = useTranslation();
  const cells = Object.entries(verb.tenses[tense]) as [Person, CheckedCell][];
  const aiOnly = cells.some(([, cell]) => cell.status === 'ai-only');
  return (
    <section
      aria-label={t(`conjugation.tenses.${tense}.name`)}
      className={`border-t border-ink-200 ${compact ? 'py-3' : 'py-5'}`}
    >
      <h3 className={`font-serif font-semibold text-ink-900 ${compact ? 'text-base' : 'text-lg'}`}>
        {t(`conjugation.tenses.${tense}.name`)}
      </h3>
      {!compact && (
        <>
          <p className="mt-1 break-words text-sm text-ink-700">{t(`conjugation.tenses.${tense}.use`)}</p>
          <p className="break-words text-sm text-ink-500">{t(`conjugation.tenses.${tense}.form`)}</p>
        </>
      )}
      {aiOnly && <p className="mt-1 text-xs text-ink-500">{t('conjugation.page.aiOnly')}</p>}
      <ul
        className={
          compact
            ? 'mt-2 grid auto-cols-fr grid-flow-col grid-rows-3 gap-x-6 gap-y-1'
            : 'mt-3 grid gap-x-10 gap-y-1.5 sm:grid-flow-col sm:grid-rows-3'
        }
      >
        {cells.map(([person, cell]) => (
          <li key={person} className="min-w-0">
            {cell.status === 'differs' && cell.ruleForms ? (
              <ComparedLines model={cellText(cell)} rule={ruleText(tense, person, verb, cell.ruleForms)} />
            ) : (
              <p className={`break-words font-serif text-ink-900 ${compact ? 'text-base' : 'text-lg'}`}>
                {cellText(cell)}
              </p>
            )}
          </li>
        ))}
      </ul>
      {example && (
        <div className="mt-4">
          <p className="text-xs text-ink-500">{t('conjugation.page.example')}</p>
          <p className="break-words font-serif text-base text-ink-900">{example.fr}</p>
          <p className="break-words text-sm text-ink-600">{example.gloss}</p>
        </div>
      )}
    </section>
  );
}
