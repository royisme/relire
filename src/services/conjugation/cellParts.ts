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

/** The caller selects only cells the verb has; absent persons are not fabricated. */
export function cellParts(view: VerifiedVerb, tense: Tense, person: Person): CellParts {
  const cell = view.tenses[tense][person]!;
  const parts: CellParts = {
    tense,
    person,
    subject: view.defective === 'impersonal' ? 'il' : SUBJECT[person],
    ...(view.pronominal && { reflexive: REFLEXIVE[person] }),
    ...(view.hAspire && { hAspire: view.hAspire }),
    verb: cell.forms,
  };
  if (isCompoundTense(tense)) {
    parts.aux = AUXILIARY_FORMS[view.aux][COMPOUND_AUX[tense]][personIndex(person)];
    parts.participle = passeComposeParticiples(view, person, {
      ms: view.participles.ms!.form,
      fs: view.participles.fs!.form,
      mp: view.participles.mp!.form,
      fp: view.participles.fp!.form,
    });
    parts.verb = [];
  } else if (tense === 'imperatif' && view.pronominal) {
    const clitic = IMPERATIVE_CLITICS[person as ImperativePerson];
    parts.verb = cell.forms.map((form) => form.slice(0, -clitic.length));
  }
  return parts;
}
