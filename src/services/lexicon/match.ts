/**
 * Which cells of a lexicon verb write a tapped form: the pure counterpart of the pack's reverse lookup, in the
 * same shape so the word sheet draws one line for both. A cell with several variants matches when any variant
 * does. Owns that matching only; never derives a compound tense or an auxiliary (the lexicon has none).
 */
import { FINITE_PERSONS, TENSES, type Person } from '../../types/grammarPack';
import type { VerbData } from '../../types/lexicon';
import { normalizeLookupToken } from '../grammarPack/lookup';
import type { VerbFormGroup } from '../grammarPack/reverse';

export type VerbFormMatch = Pick<VerbFormGroup, 'tenses' | 'participles'>;

/** The participles in the order the page shows them. */
const PARTICIPLES = ['present', 'ms', 'fs', 'mp', 'fp'] as const;

export function matchVerbForm(data: VerbData, token: string): VerbFormMatch {
  const key = normalizeLookupToken(token);
  const writes = (forms: string[] | undefined) => forms?.some((form) => normalizeLookupToken(form) === key) ?? false;
  return {
    tenses: TENSES.flatMap((tense) => {
      const cells: Partial<Record<Person, string[]>> | undefined =
        tense === 'passeCompose' ? undefined : data.tenses[tense];
      const persons = FINITE_PERSONS.filter((person) => writes(cells?.[person]));
      return persons.length ? [{ tense, persons }] : [];
    }),
    participles: PARTICIPLES.filter((participle) =>
      writes(participle === 'present' ? data.participles.present : data.participles.past[participle]),
    ),
  };
}
