/**
 * `negation`: the reader sentence rewritten with ne … pas, computed by rule.
 * Null means the rule does not cover this sentence; a skipped sentence is not an error.
 * No AI, no key, no IO.
 */
import type { ReaderGlossaryEntry, Sentence } from '../../../types/gradedReader';
import {
  cliticOf,
  determinerOf,
  elides,
  entriesOf,
  firstNounAfter,
  replacePhrase,
  verbOf,
  type VerbWord,
} from './words';

/** The indefinite and partitive articles that become `de` after the negation. */
const TURNS_TO_DE = ['un', 'une', 'des', 'du', 'de la', 'de l’'];

export function transformNegation(sentence: Sentence, glossary: ReaderGlossaryEntry[]): { answer: string } | null {
  const verb = verbOf(sentence, glossary);
  if (!verb) return null;
  // A sentence that already holds a negation is not negated twice (an elided `n’est` keeps it in the prefix).
  // An `n’` counts only up to the verb: after it, `n’importe` (`Il mange n’importe quoi`) is not a negation.
  const alreadyNegated =
    verb.words.some((word) => word.text.toLowerCase() === 'ne') ||
    verb.words.slice(0, verb.index + 1).some((word) => word.prefix.toLowerCase() === 'n’');
  if (alreadyNegated) return null;
  // `il y a` negates on `y`, not on `a`: Il n’y a pas …
  const existential =
    verb.index >= 2 &&
    verb.words[verb.index - 1].text.toLowerCase() === 'y' &&
    verb.words[verb.index - 2].text.toLowerCase() === 'il';
  // An object pronoun before the verb takes `ne` before itself, which this rule does not build; the clitics it
  // leaves in place are subject and neutral (`ce`), and existential (`y`) only in a true `il y …`: the `y` of
  // `J’y vais` is an object-like adverbial clitic, so that sentence is skipped. One token can carry two clitics
  // (`J’y` binds both `je` and `y`), so every function entry of the word is checked, not only the first.
  const before = verb.words[verb.index - 1];
  const clitics = before
    ? entriesOf(sentence, glossary, before.ordinal).filter((entry) => entry.pos === 'function')
    : [];
  const leftInPlace = existential ? ['subject', 'existential', 'neutral'] : ['subject', 'neutral'];
  if (clitics.some((entry) => !leftInPlace.includes(entry.sense))) return null;
  const negated = existential ? verb.words[verb.index - 1] : verb.word;
  const start = negated.start + negated.prefix.length;
  const clitic = verb.word.prefix && !existential ? cliticOf(sentence, glossary, verb.word) : { text: '', start };
  if (!clitic) return null;
  // être keeps its article after the negation; every other verb turns its first indefinite article into de.
  const base = verb.entry.lemma === 'être' ? sentence.fr : withDe(sentence, glossary, verb);
  if (base === null) return null;
  return {
    answer:
      base.slice(0, clitic.start) +
      (clitic.text ? `${clitic.text} ` : '') +
      (existential || elides(negated.lookup) ? 'n’' : 'ne ') +
      base.slice(start, verb.word.end) +
      ' pas' +
      base.slice(verb.word.end),
  };
}

/**
 * The first noun phrase after the verb, with an indefinite or partitive article written as `de`.
 * Null when the phrase's article cannot be seen (an adjective before the noun): the sentence is skipped
 * rather than left with an article the rule should have changed.
 */
function withDe(sentence: Sentence, glossary: ReaderGlossaryEntry[], verb: VerbWord) {
  const noun = firstNounAfter(sentence, glossary, verb.words, verb.index);
  if (!noun) return sentence.fr;
  const determiner = determinerOf(sentence, glossary, verb.words, noun.index);
  if (!determiner) return null;
  if (!TURNS_TO_DE.includes(determiner.text)) return sentence.fr;
  return replacePhrase(sentence.fr, determiner, noun.word, elides(noun.word.lookup) ? 'd’' : 'de', noun.word.lookup);
}
