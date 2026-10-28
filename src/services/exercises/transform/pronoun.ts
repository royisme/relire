/**
 * `pronoun`: the object after the finite verb replaced with le, la, l’ or les, computed by rule.
 * Null means the rule does not cover this sentence; a skipped sentence is not an error.
 * No AI, no key, no IO.
 */
import type { ReaderGlossaryEntry, Sentence } from '../../../types/gradedReader';
import { cliticOf, determinerOf, elides, entriesOf, firstNounAfter, verbOf } from './words';

/** Definite articles this kind replaces; indefinite, partitive and possessive objects are not this replacement. */
const DEFINITE = ['le', 'la', 'l’', 'les'];

export function transformPronoun(sentence: Sentence, glossary: ReaderGlossaryEntry[]): { answer: string } | null {
  const verb = verbOf(sentence, glossary);
  if (!verb) return null;
  // The complement of être is an attribute, not an object (`C’est le salon.`).
  if (verb.entry.lemma === 'être') return null;
  // `il y a` has nothing to replace with a pronoun (`Il y a le salon.`).
  const existential =
    verb.index >= 2 &&
    verb.words[verb.index - 1].text.toLowerCase() === 'y' &&
    verb.words[verb.index - 2].text.toLowerCase() === 'il';
  if (existential) return null;
  // An object pronoun already before the verb is not built again. Only a subject function entry may sit there;
  // one token can carry two clitics (`J’y` binds both `je` and `y`), so every function entry is checked.
  const before = verb.words[verb.index - 1];
  const clitics = before
    ? entriesOf(sentence, glossary, before.ordinal).filter((entry) => entry.pos === 'function')
    : [];
  if (clitics.some((entry) => entry.sense !== 'subject')) return null;
  const noun = firstNounAfter(sentence, glossary, verb.words, verb.index);
  if (!noun) return null;
  // No visible article (an adjective before the noun) is skipped; so is anything but le, la, l’ or les.
  const determiner = determinerOf(sentence, glossary, verb.words, noun.index);
  if (!determiner || !DEFINITE.includes(determiner.text)) return null;
  // The phrase must start on the character after the verb's space; a preposition or adverb in between is not it.
  if (determiner.start !== verb.word.end + 1) return null;
  // Gender comes from the noun entry, not the article. An article that disagrees is a bad sentence, skipped.
  if (determiner.text === 'le' && noun.entry.gender !== 'masculine') return null;
  if (determiner.text === 'la' && noun.entry.gender !== 'feminine') return null;
  // An elided subject (`J’ai`) is restored as a whole word, as `negation` does. No glossary clitic, no answer.
  const clitic = verb.word.prefix ? cliticOf(sentence, glossary, verb.word) : null;
  if (verb.word.prefix && !clitic) return null;
  // Singular le/la become l’ when the verb starts with a vowel sound or mute h. les never elides.
  const pronoun =
    determiner.text === 'les'
      ? 'les'
      : elides(verb.word.lookup)
        ? 'l’'
        : noun.entry.gender === 'masculine'
          ? 'le'
          : 'la';
  const written = pronoun.endsWith('’') ? pronoun : `${pronoun} `;
  // Dropping the verb's end through the noun drops the object and the space before it; what follows stays.
  return {
    answer:
      sentence.fr.slice(0, verb.word.start) +
      (clitic ? `${clitic.text} ` : '') +
      written +
      sentence.fr.slice(verb.word.start + verb.word.prefix.length, verb.word.end) +
      sentence.fr.slice(noun.word.end),
  };
}
