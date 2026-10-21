/** Owns normalized noun identity and longest-ending matching for lookup hints and drills, not gender inference. */
import type { NounGenderPack } from '../../types/nounGender';

export const normalizeNounLemma = (lemma: string) => lemma.normalize('NFC').trim().toLowerCase();

// Match complete POS words, not pronoun/pronom, adverb or a verb's infinitive ending.
const NOUN_PART_OF_SPEECH = /\bnouns?\b|\bnom\b|\bsubstantif\b|\u540d\u8bcd/i;
export const isNounEntry = (partOfSpeech: string) => NOUN_PART_OF_SPEECH.test(partOfSpeech);

export function matchNounGender(pack: NounGenderPack, lemma: string) {
  const normalized = normalizeNounLemma(lemma);
  const rule = pack.rules.reduce<(typeof pack.rules)[number] | undefined>(
    (longest, candidate) =>
      normalized.endsWith(candidate.ending) && (!longest || candidate.ending.length > longest.ending.length)
        ? candidate
        : longest,
    undefined,
  );
  if (!rule) return undefined;
  const noun = pack.nouns.find((noun) => normalizeNounLemma(noun.lemma) === normalized);
  return { rule, noun, exception: noun !== undefined && noun.gender !== rule.gender };
}
