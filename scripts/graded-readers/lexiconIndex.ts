/** Owns the gate's morphology seam and synthetic adapter; no files or private dictionary access. */
import { normalizeLookupToken } from '../../src/services/grammarPack/lookup';
import type { Verb } from '../../src/types/grammarPack';

export interface LexiconCandidate {
  lemma: string;
  pos: 'verb' | 'noun' | 'adjective';
  slot: string;
}
export interface LexiconIndex {
  candidates(form: string): readonly LexiconCandidate[];
  reviewedVerb(lemma: string): Verb | undefined;
}
export function memoryLexicon(
  rows: readonly (LexiconCandidate & { form: string })[],
  verbs: readonly Verb[] = [],
): LexiconIndex {
  const index = new Map<string, LexiconCandidate[]>();
  for (const { form, ...candidate } of rows) {
    const key = normalizeLookupToken(form);
    index.set(key, [...(index.get(key) ?? []), candidate]);
  }
  return {
    candidates: (form) => index.get(normalizeLookupToken(form)) ?? [],
    reviewedVerb: (lemma) =>
      verbs.find(
        (verb) =>
          verb.prov.status === 'reviewed' && normalizeLookupToken(verb.infinitive) === normalizeLookupToken(lemma),
      ),
  };
}
