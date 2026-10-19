/**
 * How a conjugated cell is written out: lead and forms joined as in a dictionary entry. Owns text assembly for
 * the Conjugation page only. Does not own any status wording or layout.
 */
import type { CheckedCell, VerifiedVerb } from '../../../services/conjugation/verify';
import { TENSES } from '../../../types/grammarPack';
import type { Person, RuleId, Tense } from '../../../types/grammarPack';

/**
 * Whether a tense's generic "how it is formed" line is true for a verb with this rule. Never for an irregular verb
 * or one whose rule is unknown; the present and imperatif lines speak of -er endings, so only for an `er-` rule.
 */
export const showsFormLine = (tense: Tense, rule: RuleId | undefined) =>
  rule !== undefined &&
  rule !== 'irregular' &&
  ((tense !== 'present' && tense !== 'imperatif') || rule.startsWith('er-'));

/** The rule's ending table comes from the same engine parts that write the cells, never a second table. */
export function ruleEndingRows(verb: VerifiedVerb) {
  return TENSES.filter((tense) => tense !== 'passeCompose').flatMap((tense) => {
    const endings = Object.fromEntries(
      Object.entries(verb.tenses[tense]).flatMap(([person, cell]) => {
        const parts = cell.ruleParts ?? cell.parts;
        return parts ? [[person, [...new Set(parts.map((part) => part.ending))].join(' / ')]] : [];
      }),
    ) as Partial<Record<Person, string>>;
    return Object.keys(endings).length ? [{ tense, endings }] : [];
  });
}

/** Primary form first, then variants. */
export const formsLabel = (forms: string[]) => forms.join(' / ');

/** One space between lead and forms, none after an elided lead (`j’aime`); none at all when the lead is empty. */
export const joinLead = (lead: string, text: string) =>
  lead === '' || lead.endsWith('’') ? lead + text : `${lead} ${text}`;

/** The cell as written: `nous parlons`, `j’aime`, `parle` (imperatif). */
export const cellText = (cell: Pick<CheckedCell, 'lead' | 'forms'>) => joinLead(cell.lead, formsLabel(cell.forms));
