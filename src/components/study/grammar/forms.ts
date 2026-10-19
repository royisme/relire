/**
 * How a conjugated cell is written out: lead and forms joined as in a dictionary entry. Owns text assembly for
 * the Conjugation page only. Does not own any status wording or layout.
 */
import type { CheckedCell } from '../../../services/conjugation/verify';
import { composeLead } from '../../../services/conjugation/rules';
import type { Person, RuleId, Tense, Verb } from '../../../types/grammarPack';

/**
 * Whether a tense's generic "how it is formed" line is true for a verb with this rule. Never for an irregular verb
 * or one whose rule is unknown; the present and imperatif lines speak of -er endings, so only for an `er-` rule.
 */
export const showsFormLine = (tense: Tense, rule: RuleId | undefined) =>
  rule !== undefined &&
  rule !== 'irregular' &&
  ((tense !== 'present' && tense !== 'imperatif') || rule.startsWith('er-'));

/** Primary form first, then variants. */
export const formsLabel = (forms: string[]) => forms.join(' / ');

/** One space between lead and forms, none after an elided lead (`j’aime`); none at all when the lead is empty. */
export const joinLead = (lead: string, text: string) =>
  lead === '' || lead.endsWith('’') ? lead + text : `${lead} ${text}`;

/** The cell as written: `nous parlons`, `j’aime`, `parle` (imperatif). */
export const cellText = (cell: Pick<CheckedCell, 'lead' | 'forms'>) => joinLead(cell.lead, formsLabel(cell.forms));

/**
 * The rule's line of a differing cell. Its lead is composed again from the rule's own first form, because the
 * model's form may start with another letter (`j’` against `je`).
 */
export function ruleText(
  tense: Tense,
  person: Person,
  verb: { pronominal: boolean; defective?: Verb['defective'] },
  ruleForms: string[],
) {
  return joinLead(composeLead(tense, person, verb, ruleForms[0]), formsLabel(ruleForms));
}
