/** Owns private review evidence and gate context, not public reader contracts or review marking. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalVocabularyJson } from '../../src/services/vocabulary/book';
import type { ReaderGlossaryEntry, ReaderReviews, ReaderSyllabus } from '../../src/types/gradedReader';
import type { Core, Candidates, ReaderDraft } from './drafts';
import type { LexiconIndex } from './lexiconIndex';

const text = z
  .string()
  .min(1)
  .refine(
    (value) => value === value.trim() && value === value.normalize('NFC') && !/\p{Cc}|\p{Cf}/u.test(value),
    'Evidence text must be trimmed NFC without controls',
  );
const review = { reviewedBy: text, reference: text };
export const GateEvidenceSchema = z.strictObject({
  ...review,
  // Topic coverage and extraction intent are authored review evidence, not inferred from labels.
  topics: z.array(z.strictObject({ topicId: text, sentenceIds: z.array(text).min(1) })),
  extractionQuestions: z.array(text),
  compounds: z.array(text),
  modalLemmas: z.array(text),
  pronominals: z.array(z.strictObject({ lemma: text, base: text, clitic: z.literal('se') })),
  compoundPast: z.array(
    z.strictObject({
      lemma: text,
      aux: z.enum(['avoir', 'être']),
      participles: z.strictObject({ ms: text, fs: text, mp: text, fp: text }),
    }),
  ),
  // Nontrivial inversions/liaison are explicitly checked on the final spelling.
  inversions: z.array(text),
  // Later clause markers must name a topic taught in the applicable syllabus prefix.
  clauseMarkers: z.array(z.strictObject({ form: text, topicId: text })),
});
export type GateEvidence = z.infer<typeof GateEvidenceSchema>;
export interface GateContext {
  syllabus: ReaderSyllabus;
  core: Core;
  candidates: Candidates;
  previous: ReaderDraft[];
  reviews: ReaderReviews;
  topicIds: readonly string[];
  lexicon: LexiconIndex;
  reviewedNouns: readonly Pick<ReaderGlossaryEntry, 'lemma' | 'gender'>[];
  evidence: GateEvidence;
}
export const contentHash = (value: unknown) =>
  createHash('sha256').update(canonicalVocabularyJson(value), 'utf8').digest('hex');
/** Publication flags (`include`, `bundled`) are state, not policy: flipping them must not lapse drafts or reviews. */
export const policyHash = (syllabus: ReaderSyllabus, core: Core, order: number) =>
  contentHash({
    syllabusVersion: syllabus.syllabusVersion,
    stages: syllabus.stages.slice(0, order).map(({ include: _include, bundled: _bundled, ...policy }) => policy),
    core,
  });
