/**
 * Builds the view of a verb from an AI answer: leads, passé composé and the
 * hyphenated imperative clitics, composed by the engine from the AI's forms and
 * participles, for any rule (including `irregular` and rule misfits). Also owns
 * the two small string helpers that hand the learner's infinitive to the engine.
 * Never calls `generateVerb`, and does not decide whether the AI is right
 * (verify.ts).
 */
import type { ConjugationAnswer } from '../../types/conjugationAnswer';
import type { Cell, ImperativePerson, Person, Tense, Verb } from '../../types/grammarPack';
import { IMPERATIVE_CLITICS, composeLead, passeComposeForms } from './rules';

/** What the Conjugation screen renders: a pack row without its id and provenance. */
export type VerbView = Omit<Verb, 'id' | 'prov'>;

/**
 * The learner's infinitive in the engine's form: NFC, trimmed, single spaces and the typographic apostrophe
 * (`isPronominal` in generate.ts and the pack schema accept only U+2019).
 */
export const engineInfinitive = (typed: string) =>
  typed
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/['‘]/g, '’');

/** The infinitive without a leading `se ` or `s’`. */
export const bareInfinitive = (infinitive: string) => infinitive.replace(/^(se |s’)/, '');

/**
 * The `base` of a `VerbSpec` for the regular rule families: the bare infinitive without its `-er`, `-ir` or
 * `-re`. Undefined when the infinitive has none of them.
 */
export function engineBase(infinitive: string): string | undefined {
  const bare = bareInfinitive(infinitive);
  return /(er|ir|re)$/.test(bare) ? bare.slice(0, -2) : undefined;
}

/** The imperative of a pronominal verb takes its postposed clitic (`-toi`, `-nous`, `-vous`). */
export const withClitic = (pronominal: boolean, person: ImperativePerson, forms: string[]) =>
  pronominal ? forms.map((form) => form + IMPERATIVE_CLITICS[person]) : forms;

function cellsOf<P extends string>(
  forms: Partial<Record<P, string[]>>,
  make: (person: P, list: string[]) => Cell,
): Partial<Record<P, Cell>> {
  const out: Partial<Record<P, Cell>> = {};
  for (const [person, list] of Object.entries(forms) as [P, string[]][]) out[person] = make(person, list);
  return out;
}

export function assembleVerb(answer: ConjugationAnswer): VerbView {
  const { pronominal, defective, hAspire, aux, participles } = answer;
  const cell = (tense: Tense, person: Person, forms: string[]): Cell => ({
    lead: composeLead(tense, person, { pronominal, defective, hAspire }, forms[0]),
    forms,
  });
  const simple = (tense: 'present' | 'imparfait' | 'futur' | 'conditionnel' | 'subjonctif') =>
    cellsOf(answer.forms[tense], (person, list) => cell(tense, person, list));

  return {
    infinitive: answer.infinitive,
    pronominal,
    aux,
    rule: answer.rule,
    ...(defective && { defective }),
    tenses: {
      present: simple('present'),
      // The AI is never asked for passé composé: it is the auxiliary plus the AI's participles.
      passeCompose: cellsOf(answer.forms.present, (person) =>
        cell('passeCompose', person, passeComposeForms({ aux }, person, participles.past)),
      ),
      imparfait: simple('imparfait'),
      futur: simple('futur'),
      conditionnel: simple('conditionnel'),
      subjonctif: simple('subjonctif'),
      ...(answer.forms.imperatif && {
        imperatif: cellsOf(answer.forms.imperatif, (person, list) =>
          cell('imperatif', person, withClitic(pronominal, person, list)),
        ),
      }),
    },
    participles,
  };
}
