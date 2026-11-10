/**
 * Whether a word-analysis entry is a verb whose infinitive can be conjugated. Owns that one rule for the word
 * sheet and imports nothing, so the main bundle can use it without the pack or the engine. Does not look the verb
 * up (lookup.ts) and does not trust the entry: the lemma and the part of speech are the model's free text.
 */

// `-oir` ends in `ir`. The part of speech is matched on a word boundary, so `adverb` is not a verb; the model
// answers in the learner's language, so the Chinese word for verb (written as escapes, no Chinese in code) counts too.
const INFINITIVE_SHAPE = /^(se |s['’])|(er|ir|re)$/;
const VERB_PART_OF_SPEECH = /\bverbe?\b|\u52a8\u8bcd/i;

export const isVerbEntry = (lemma: string, partOfSpeech: string) =>
  INFINITIVE_SHAPE.test(lemma.trim().toLowerCase()) && VERB_PART_OF_SPEECH.test(partOfSpeech);
