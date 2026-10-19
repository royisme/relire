/**
 * One tense of the result: its name, when it is used, how it is formed, the persons as dictionary rows and the
 * AI's example sentence when there is one. The form line shows only when it is true for the verb's rule
 * (`showsFormLine`). `compact` is the word sheet's form: no use and form lines, tighter rows; `tapped` marks the
 * persons whose cell is the word the learner tapped. Owns that section only. Does not own the verb header, the participles or any request.
 */
import { useTranslation } from 'react-i18next';
import type { CheckedCell, VerifiedVerb } from '../../../services/conjugation/verify';
import type { ConjugationAnswer } from '../../../types/conjugationAnswer';
import type { Person, Tense } from '../../../types/grammarPack';
import { composeLead } from '../../../services/conjugation/rules';
import { CellForm } from './CellForm';
import { ComparedLines } from './ComparedLines';
import { ConjugationSpeakButton } from './ConjugationSpeakButton';
import { cellText, showsFormLine } from './forms';

interface Props {
  tense: Tense;
  verb: VerifiedVerb;
  example?: ConjugationAnswer['examples'][Tense];
  compact?: boolean;
  tapped?: Person[];
}

export function TenseSection({ tense, verb, example, compact, tapped }: Props) {
  const { t } = useTranslation();
  const cells = Object.entries(verb.tenses[tense]) as [Person, CheckedCell][];
  const aiOnly = cells.some(([, cell]) => cell.status === 'ai-only');
  const differs = cells.some(([, cell]) => cell.status === 'differs');
  return (
    <section
      aria-label={t(`conjugation.tenses.${tense}.name`)}
      className={`border-t border-ink-200 ${compact ? 'py-3' : 'py-5'}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className={compact ? 'text-sm font-medium text-ink-600' : 'font-serif text-lg font-semibold text-ink-900'}>
          {t(`conjugation.tenses.${tense}.name`)}
        </h3>
        {differs && <p className="text-xs font-medium text-bad-700">{t('conjugation.page.differs')}</p>}
      </div>
      {!compact && (
        <>
          <p className="mt-1 break-words text-sm text-ink-700">{t(`conjugation.tenses.${tense}.use`)}</p>
          {showsFormLine(tense, verb.rule) && (
            <p className="break-words text-sm text-ink-500">{t(`conjugation.tenses.${tense}.form`)}</p>
          )}
        </>
      )}
      {aiOnly && <p className="mt-1 text-xs text-ink-500">{t('conjugation.page.aiOnly')}</p>}
      <ul
        className={
          compact
            ? 'mt-2 grid gap-x-6 gap-y-1 sm:grid-flow-col sm:grid-rows-3'
            : 'mt-3 grid gap-x-10 gap-y-1.5 sm:grid-flow-col sm:grid-rows-3'
        }
      >
        {cells.map(([person, cell]) => (
          <li key={person} className="min-w-0">
            {cell.status === 'differs' && cell.ruleForms ? (
              <ComparedLines
                model={cellText(cell)}
                rule={cellText({
                  lead: composeLead(tense, person, verb, cell.ruleForms[0]),
                  forms: cell.ruleForms,
                })}
                ruleContent={
                  <CellForm
                    cell={{
                      lead: composeLead(tense, person, verb, cell.ruleForms[0]),
                      forms: cell.ruleForms,
                      parts: cell.ruleParts,
                    }}
                  />
                }
              />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p
                  aria-current={tapped?.includes(person) ? 'true' : undefined}
                  className={`min-w-0 pt-1.5 break-words font-serif text-ink-900 ${compact ? 'text-base' : 'text-lg'} ${
                    tapped?.includes(person)
                      ? 'font-semibold underline decoration-accent-700 decoration-2 underline-offset-4'
                      : ''
                  }`}
                >
                  <CellForm cell={cell} />
                </p>
                <ConjugationSpeakButton text={cellText(cell)} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {example && (
        <div className="mt-4">
          <p className="text-xs text-ink-500">{t('conjugation.page.example')}</p>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 pt-1.5 break-words font-serif text-base text-ink-900">{example.fr}</p>
            <ConjugationSpeakButton text={example.fr} />
          </div>
          <p className="break-words text-sm text-ink-600">{example.gloss}</p>
        </div>
      )}
    </section>
  );
}
