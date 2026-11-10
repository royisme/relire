/**
 * How typed or clicked French text is matched against the pack: one normalisation for keys and queries, and the
 * exact-infinitive lookup. Owns matching only. Never uses `normalizeFrench` (it would merge `a` with `à` and turn
 * `-` into `'`), never adds or removes a pronoun (`lever` is not `se lever`), and does not load the pack.
 */
import type { GrammarPack, Verb } from '../../types/grammarPack';

/**
 * Keeps diacritics and hyphens (`lève-toi`); folds U+2018, U+2019 and the backtick to `'` and U+2010 to U+2015 to
 * `-`; NFC, lowercase, trimmed, spaces collapsed. For lookup keys only: text for display or for the engine is
 * not folded this way (`engineInfinitive`).
 */
export const normalizeLookupToken = (text: string) =>
  text
    .replace(/[‘’`]/g, "'")
    .replace(/[‐-―]/g, '-')
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

/** The pack row whose infinitive is exactly the typed one after normalisation, if any. */
export function findPackVerb(pack: GrammarPack, typed: string): Verb | undefined {
  const key = normalizeLookupToken(typed);
  return pack.verbs.find((verb) => normalizeLookupToken(verb.infinitive) === key);
}
