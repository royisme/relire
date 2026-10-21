/**
 * The conjugation slot of a verb that is not in the pack, when a content service is configured: the simple tenses
 * the lexicon holds, behind the same "Show all tenses" disclosure, marked as from the dictionary and not
 * reviewed, with the tapped cells marked and one line sending compound tenses to the Conjugation page (the
 * lexicon has no passé composé and no auxiliary, so none is drawn). Without an entry, `fallback` (the plain link
 * to the Conjugation page) is drawn; a lexicon failure shows its real text above it. A plain `ui/table`, not
 * the page's `TenseSection`: that draws a verified verb with statuses and an auxiliary the lexicon cannot supply.
 */
import { useTranslation } from 'react-i18next';
import { useLexiconVerb } from '../../hooks/useLexiconVerb';
import { matchVerbForm } from '../../services/lexicon/match';
import { lexiconTable } from '../../services/lexicon/table';
import { FINITE_PERSONS, TENSES, isCompoundTense } from '../../types/grammarPack';
import type { ReactNode } from 'react';
import { cellText } from '../study/grammar/forms';
import { Link } from '../shell/Link';
import { Table, TableBody, TableCell, TableRow } from '../ui/table';
import { TensesDisclosure } from './TensesDisclosure';

export function DictionaryTenses({ lemma, lookup, fallback }: { lemma: string; lookup: string; fallback: ReactNode }) {
  const { t } = useTranslation();
  const { status, data, error } = useLexiconVerb(lemma);

  if (status === 'loading') return <p className="text-sm text-ink-500">{t('wordModal.conjugationLoading')}</p>;
  if (status === 'error')
    return (
      <div className="space-y-2">
        <p role="alert" className="break-words text-sm text-bad-700">
          {error}
        </p>
        {fallback}
      </div>
    );
  if (!data) return fallback;

  const table = lexiconTable(lemma, data);
  if (!table) return fallback;
  const tapped = matchVerbForm(data, lookup).tenses;
  return (
    <TensesDisclosure>
      <p className="text-xs text-ink-500">{t('wordModal.dictionaryNote')}</p>
      {TENSES.flatMap((tense) => {
        const cells = isCompoundTense(tense) ? undefined : table.tenses[tense];
        if (!cells) return [];
        const hits = tapped.find((entry) => entry.tense === tense)?.persons ?? [];
        return [
          <section
            key={tense}
            aria-label={t(`conjugation.tenses.${tense}.name`)}
            className="mt-2 border-t border-ink-200 py-3"
          >
            <h3 className="text-sm font-medium text-ink-600">{t(`conjugation.tenses.${tense}.name`)}</h3>
            <Table className="mt-1">
              <TableBody>
                {FINITE_PERSONS.flatMap((person) => {
                  const cell = cells[person];
                  if (!cell) return [];
                  return [
                    <TableRow key={person} className="border-0 hover:bg-transparent">
                      {/* Pronominal cells already carry their subject and reflexive lead. */}
                      {tense !== 'imperatif' && !table.pronominal && (
                        <TableCell className="w-24 px-0 py-1 align-baseline text-ink-500">
                          {t(`conjugation.pronouns.${person}`)}
                        </TableCell>
                      )}
                      <TableCell
                        aria-current={hits.includes(person) ? 'true' : undefined}
                        className={`whitespace-normal break-words px-0 py-1 font-serif text-base text-ink-900 ${
                          hits.includes(person)
                            ? 'font-semibold underline decoration-accent-700 decoration-2 underline-offset-4'
                            : ''
                        }`}
                      >
                        {cellText(cell)}
                      </TableCell>
                    </TableRow>,
                  ];
                })}
              </TableBody>
            </Table>
          </section>,
        ];
      })}
      <Link
        to={{ name: 'grammar', section: 'conjugation', verb: lemma }}
        className="text-sm text-accent-900 underline underline-offset-2"
      >
        {t('wordModal.compoundTenses')}
      </Link>
    </TensesDisclosure>
  );
}
