/**
 * Structured, unelided parts of a displayed cell, for sentence patterns only.
 * Does not parse composed leads or compound strings, change the grid, or decide status.
 */
import type { ImperativePerson, Person, Tense } from '../../types/grammarPack';
import { isCompoundTense } from '../../types/grammarPack';
import type { VerifiedVerb } from './verify';
import {
  AUXILIARY_FORMS,
  COMPOUND_AUX,
  IMPERATIVE_CLITICS,
  REFLEXIVE,
  SUBJECT,
  passeComposeParticiples,
  personIndex,
} from './rules';

export interface CellParts {
  tense: Tense;
  person: Person;
  subject: string;
  reflexive?: string;
  aux?: string;
  verb: string[];
  participle?: string[];
  hAspire?: true;
}

/** A person of the grid, or `on`: the owner's extra third person singular subject for the patterns. */
export type SubjectChoice = Person | 'on';

/** The patterns offer the `on` subject only for a full verb; a defective verb (impersonal or third person only) takes no `on`. */
export const takesOn = (view: VerifiedVerb) => view.defective === undefined;

/** The caller selects only cells the verb has; absent persons are not fabricated. */
export function cellParts(view: VerifiedVerb, tense: Tense, person: SubjectChoice): CellParts {
  // `on` is a third person singular subject that agrees like `il`: the same cell, the masculine singular participle only.
  const on = person === 'on';
  const cellPerson: Person = on ? '3sg' : person;
  const cell = view.tenses[tense][cellPerson]!;
  const parts: CellParts = {
    tense,
    person: cellPerson,
    subject: on ? 'on' : view.defective === 'impersonal' ? 'il' : SUBJECT[cellPerson],
    ...(view.pronominal && { reflexive: REFLEXIVE[cellPerson] }),
    ...(view.hAspire && { hAspire: view.hAspire }),
    verb: cell.forms,
  };
  if (isCompoundTense(tense)) {
    parts.aux = AUXILIARY_FORMS[view.aux][COMPOUND_AUX[tense]][personIndex(cellPerson)];
    parts.participle = on
      ? [view.participles.ms!.form]
      : passeComposeParticiples(view, cellPerson, {
          ms: view.participles.ms!.form,
          fs: view.participles.fs!.form,
          mp: view.participles.mp!.form,
          fp: view.participles.fp!.form,
        });
    parts.verb = [];
  } else if (tense === 'imperatif' && view.pronominal) {
    const clitic = IMPERATIVE_CLITICS[cellPerson as ImperativePerson];
    parts.verb = cell.forms.map((form) => form.slice(0, -clitic.length));
  }
  return parts;
}
