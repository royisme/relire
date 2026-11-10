/**
 * `number`: the noun phrase right after the finite verb put into the other number, computed by rule.
 * Only that phrase changes: determiner and noun.
 * Subject agreement after `être` and `c’est` → `ce sont` are out of version 1, so every être sentence is skipped.
 * No AI, no key, no IO.
 */
import type { ReaderGlossaryEntry, Sentence } from '../../../types/gradedReader';
import { determinerOf, elides, firstNounAfter, replacePhrase, verbOf } from './words';

/** Noun lemmas whose plural is irregular (s, x, z, al, ail, au, eu) are out of version 1. */
const IRREGULAR_PLURAL = /(?:s|x|z|al|ail|au|eu)$/;

export function transformNumber(sentence: Sentence, glossary: ReaderGlossaryEntry[]): { answer: string } | null {
  const verb = verbOf(sentence, glossary);
  if (!verb) return null;
  // The phrase after être must agree with the subject, and `c’est` would need `ce sont`.
  if (verb.entry.lemma === 'être') return null;
  const noun = firstNounAfter(sentence, glossary, verb.words, verb.index);
  if (!noun || IRREGULAR_PLURAL.test(noun.entry.lemma)) return null;
  const plural = `${noun.entry.lemma}s`;
  const singular = noun.word.lookup === noun.entry.lemma;
  if (!singular && noun.word.lookup !== plural) return null;
  const determiner = determinerOf(sentence, glossary, verb.words, noun.index);
  if (!determiner) return null;
  const next = singular
    ? pluralDeterminer(determiner.text)
    : singularDeterminer(determiner.text, noun.entry.gender, noun.entry.lemma);
  if (!next) return null;
  return {
    answer: replacePhrase(sentence.fr, determiner, noun.word, next, singular ? plural : noun.entry.lemma),
  };
}

function pluralDeterminer(determiner: string) {
  if (determiner === 'un' || determiner === 'une') return 'des';
  if (determiner === 'le' || determiner === 'la' || determiner === 'l’') return 'les';
  return null;
}

function singularDeterminer(determiner: string, gender: 'masculine' | 'feminine', lemma: string) {
  if (determiner === 'des') return gender === 'masculine' ? 'un' : 'une';
  if (determiner !== 'les') return null;
  if (elides(lemma)) return 'l’';
  return gender === 'masculine' ? 'le' : 'la';
}
