/**
 * Reverse lookup: which verbs, tenses and persons write a clicked form (`mange`, `lève-toi`, `allé`). Owns the
 * in-memory index of a loaded pack (built once per pack object) and the per-lemma grouping the word sheet draws.
 * Every key and every query goes through `normalizeLookupToken`, so `a` and `à` stay apart. Does not load the
 * pack, own the sheet's wording or decide which verb the sheet is about (6a reads the lemma, not these hits).
 */
import type { FormKey } from '../conjugation/verify';
import { FINITE_PERSONS, TENSES, type GrammarPack, type Person, type Tense, type Verb } from '../../types/grammarPack';
import { normalizeLookupToken } from './lookup';

/** A conjugated cell, or one of the participles. */
export type FormHit = { verbId: string } & ({ tense: Tense; person: Person } | { participle: FormKey });

/** The participles in the order the page shows them. */
const PARTICIPLES: readonly FormKey[] = ['present', 'ms', 'fs', 'mp', 'fp'];

const indexes = new WeakMap<GrammarPack, Map<string, FormHit[]>>();

function buildIndex(pack: GrammarPack): Map<string, FormHit[]> {
  const index = new Map<string, FormHit[]>();
  const add = (form: string, hit: FormHit) => {
    const key = normalizeLookupToken(form);
    const hits = index.get(key);
    if (hits) hits.push(hit);
    else index.set(key, [hit]);
  };
  for (const verb of pack.verbs) {
    // Passé composé is not indexed: its participle and its auxiliary are.
    for (const tense of TENSES.filter((name) => name !== 'passeCompose'))
      for (const [person, cell] of Object.entries(verb.tenses[tense] ?? {}))
        for (const form of cell.forms) add(form, { verbId: verb.id, tense, person: person as Person });
    for (const participle of PARTICIPLES) {
      const form = participle === 'present' ? verb.participles.present : verb.participles.past[participle];
      if (form !== undefined) add(form, { verbId: verb.id, participle });
    }
  }
  return index;
}

/** Every cell and participle of the pack that is written exactly like `token`, in pack order. */
export function reverseLookup(pack: GrammarPack, token: string): FormHit[] {
  let index = indexes.get(pack);
  if (!index) indexes.set(pack, (index = buildIndex(pack)));
  return index.get(normalizeLookupToken(token)) ?? [];
}

/** What one lemma contributes to a clicked form: its tenses with the persons, and its participles. */
export interface VerbFormGroup {
  verb: Verb;
  tenses: { tense: Tense; persons: Person[] }[];
  participles: FormKey[];
}

/** The hits merged per lemma (homographs stay separate lemmas), at most `limit` lemmas, tenses in page order. */
export function lookupVerbForms(pack: GrammarPack, token: string, limit = 4): VerbFormGroup[] {
  const hits = reverseLookup(pack, token);
  const groups: VerbFormGroup[] = [];
  for (const verb of pack.verbs) {
    const mine = hits.filter((hit) => hit.verbId === verb.id);
    if (!mine.length) continue;
    groups.push({
      verb,
      tenses: TENSES.flatMap((tense) => {
        const persons = FINITE_PERSONS.filter((person) =>
          mine.some((hit) => 'tense' in hit && hit.tense === tense && hit.person === person),
        );
        return persons.length ? [{ tense, persons }] : [];
      }),
      participles: PARTICIPLES.filter((key) => mine.some((hit) => 'participle' in hit && hit.participle === key)),
    });
  }
  return groups.slice(0, limit);
}
