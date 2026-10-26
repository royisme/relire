/**
 * The version 1 transformation kinds, each a pure function over one reader sentence and the reader's glossary.
 * Owns the kind list, its grammar tag and which kinds a reader covers; no unit, UI, AI or IO.
 */
import type { GrammarTag } from '../../../types/grammar';
import type { PublishedReader, ReaderGlossaryEntry, Sentence } from '../../../types/gradedReader';
import { READER_TRANSFORM_KINDS, type ReaderTransformKind } from '../../../types/readerTransform';
import { transformNegation } from './negation';
import { transformNumber } from './number';

/** Both tags exist in the tag list: negation is its own tag, number rides on gender-number. */
export const TRANSFORM_TAGS: Record<ReaderTransformKind, GrammarTag> = {
  negation: 'negation',
  number: 'gender-number',
};

/** Null means the rule does not cover the sentence; the caller skips it instead of guessing. */
export const TRANSFORMERS: Record<
  ReaderTransformKind,
  (sentence: Sentence, glossary: ReaderGlossaryEntry[]) => { answer: string } | null
> = {
  negation: transformNegation,
  number: transformNumber,
};

/** The kinds that cover at least one sentence of this reader; an empty list means the entry stays hidden. */
export const coveredKinds = (reader: PublishedReader) =>
  READER_TRANSFORM_KINDS.filter((kind) =>
    reader.body.sentences.some((sentence) => TRANSFORMERS[kind](sentence, reader.body.glossary) !== null),
  );
