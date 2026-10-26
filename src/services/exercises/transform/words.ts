/**
 * Word, binding and determiner lookups shared by the pure transformation kinds.
 * Owns how a reader sentence's token bindings, glossary and elisions are read; no rule, no AI, no IO.
 */
import type { ReaderGlossaryEntry, Sentence } from '../../../types/gradedReader';
import { readerWords, type ReaderWordToken } from '../../../utils/readerTokens';
import { startsWithVowelSound } from '../../conjugation/rules';

/** The glossary entries bound to one word ordinal, in glossary order. */
export function entriesOf(sentence: Sentence, glossary: ReaderGlossaryEntry[], ordinal: number) {
  const ids = sentence.tokens.find((token) => token.ordinal === ordinal)?.entryIds ?? [];
  return glossary.filter((entry) => ids.includes(entry.id));
}

/** The noun entry bound to one word, with the gender its schema requires. */
export const nounEntryOf = (sentence: Sentence, glossary: ReaderGlossaryEntry[], ordinal: number) =>
  entriesOf(sentence, glossary, ordinal).find(
    (entry): entry is ReaderGlossaryEntry & { gender: 'masculine' | 'feminine' } =>
      entry.pos === 'noun' && entry.gender !== undefined,
  );

/** The finite verb of a sentence: its word, its index in the word list and the glossary entry that named it. */
export interface VerbWord {
  word: ReaderWordToken;
  index: number;
  entry: ReaderGlossaryEntry;
  /** Every word of the sentence, so a rule indexes into the same list the verb came from. */
  words: ReaderWordToken[];
}

/** The one word bound to a verb entry; a sentence with no verb or several is outside every version 1 rule. */
export function verbOf(sentence: Sentence, glossary: ReaderGlossaryEntry[]): VerbWord | null {
  const words = readerWords(sentence.fr);
  const verbs = words.flatMap((word, index) => {
    const entry = entriesOf(sentence, glossary, word.ordinal).find((candidate) => candidate.pos === 'verb');
    return entry ? [{ word, index, entry }] : [];
  });
  return verbs.length === 1 ? { ...verbs[0], words } : null;
}

/** The first noun after the finite verb: the phrase a version 1 rule may change, or undefined when there is none. */
export function firstNounAfter(
  sentence: Sentence,
  glossary: ReaderGlossaryEntry[],
  words: ReaderWordToken[],
  verbIndex: number,
) {
  return words.flatMap((word, index) => {
    const entry = index > verbIndex ? nounEntryOf(sentence, glossary, word.ordinal) : undefined;
    return entry ? [{ word, index, entry }] : [];
  })[0];
}

/**
 * A vowel or a mute h takes an elision: `ne` → `n’`, `de` → `d’`, `le`/`la` → `l’`.
 * An aspirated h is not detected; no bundled reader has one. `y` is a consonant here (`le yaourt`),
 * and the one elided `y` of the readers is spelled out where it happens (`n’y a`).
 */
export const elides = (next: string) => startsWithVowelSound(next, false);

/**
 * The subject clitic hidden inside an elided verb token (`J’ai`, `C’est`), restored as a whole word:
 * the function entry bound to the same token supplies it. Null when the glossary cannot restore it.
 */
export function cliticOf(sentence: Sentence, glossary: ReaderGlossaryEntry[], word: ReaderWordToken) {
  const entry = entriesOf(sentence, glossary, word.ordinal).find(
    (candidate) => candidate.pos === 'function' && candidate.lemma[0]?.toLowerCase() === word.prefix[0]?.toLowerCase(),
  );
  if (!entry) return null;
  const capital = word.prefix[0] === word.prefix[0]?.toUpperCase();
  return { text: capital ? entry.lemma[0].toUpperCase() + entry.lemma.slice(1) : entry.lemma, start: word.start };
}

/** A determiner as written before a noun: its own token, or the elided prefix inside the noun token. */
export interface Determiner {
  /** Lowercase surface form; `de la` and `de l’` count as one determiner. */
  text: string;
  start: number;
}

const adjacent = (left: ReaderWordToken, right: ReaderWordToken) => right.start === left.end + 1;
const isFunction = (sentence: Sentence, glossary: ReaderGlossaryEntry[], word: ReaderWordToken) =>
  entriesOf(sentence, glossary, word.ordinal).some((entry) => entry.pos === 'function');

/**
 * The determiner of the noun at `index`, or null when the word right before it is not a function word
 * (an adjective or nothing at all). Version 1 changes only a noun phrase whose article it can see.
 */
export function determinerOf(
  sentence: Sentence,
  glossary: ReaderGlossaryEntry[],
  words: ReaderWordToken[],
  index: number,
): Determiner | null {
  const noun = words[index];
  const previous = words[index - 1];
  const beforePrevious = words[index - 2];
  if (noun.prefix)
    return previous && previous.text.toLowerCase() === 'de' && adjacent(previous, noun)
      ? { text: `de ${noun.prefix.toLowerCase()}`, start: previous.start }
      : { text: noun.prefix.toLowerCase(), start: noun.start };
  if (!previous || !adjacent(previous, noun) || !isFunction(sentence, glossary, previous)) return null;
  if (
    previous.text.toLowerCase() === 'la' &&
    beforePrevious?.text.toLowerCase() === 'de' &&
    adjacent(beforePrevious, previous)
  )
    return { text: 'de la', start: beforePrevious.start };
  return { text: previous.text.toLowerCase(), start: previous.start };
}

/** Swap a determiner and its noun for another pair; `d’` and `l’` attach to the noun without a space. */
export const replacePhrase = (
  fr: string,
  determiner: Determiner,
  noun: ReaderWordToken,
  nextDeterminer: string,
  nextNoun: string,
) =>
  fr.slice(0, determiner.start) +
  nextDeterminer +
  (nextDeterminer.endsWith('’') ? '' : ' ') +
  nextNoun +
  fr.slice(noun.end);
