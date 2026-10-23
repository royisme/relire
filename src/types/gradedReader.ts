/** Owns public reader contracts and structural invariants, not private analyses or linguistic/review gates. */
import { z } from 'zod';
import { BilingualSchema, CheckpointQuestionSchema } from './grammarCheckpoint';
import { normalizeLookupToken } from '../services/grammarPack/lookup';
import { readerWords } from '../utils/readerTokens';
import { splitArticle } from '../utils/sentences';

const text = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (value !== value.trim()) fail('Text must have no surrounding whitespace');
    if (value !== value.normalize('NFC')) fail('Text must be NFC');
    if (/\p{Cc}|\p{Cf}/u.test(value)) fail('Control characters are forbidden');
    if (/<[^>]*>/u.test(value)) fail('HTML is forbidden');
  });
const slug = text.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const hash = text.regex(/^[0-9a-f]{64}$/);
const english = text.refine((value) => !/\p{Script=Han}/u.test(value), 'Han is forbidden in English');
const chinese = text.refine((value) => /\p{Script=Han}/u.test(value), 'Chinese needs a Han character');
const french = english.refine((value) => !/['‘`]/u.test(value), 'French requires the apostrophe U+2019');
const bi = BilingualSchema.safeExtend({ en: english, zh: chinese }).strict();

function unique(values: readonly unknown[], ctx: z.RefinementCtx, path: (string | number)[]) {
  if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path, message: 'Values must be unique' });
}

export const ReaderGlossaryEntrySchema = z
  .strictObject({
    id: slug,
    lemma: french,
    pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'function', 'interjection', 'number', 'proper', 'phrase']),
    sense: slug,
    forms: z.array(french).min(1),
    gloss: bi,
    gender: z.enum(['masculine', 'feminine']).optional(),
  })
  .superRefine((entry, ctx) => {
    if ((entry.pos === 'noun') !== (entry.gender !== undefined))
      ctx.addIssue({ code: 'custom', path: ['gender'], message: 'Gender is required exactly for nouns' });
    unique(entry.forms, ctx, ['forms']);
  });
export type ReaderGlossaryEntry = z.infer<typeof ReaderGlossaryEntrySchema>;

export const TokenBindingSchema = z
  .strictObject({
    ordinal: z.number().int().nonnegative(),
    entryIds: z.array(slug).min(1),
  })
  .superRefine((binding, ctx) => unique(binding.entryIds, ctx, ['entryIds']));
export type TokenBinding = z.infer<typeof TokenBindingSchema>;

export const SentenceSchema = z
  .strictObject({
    id: slug.refine((id) => id !== 'title', 'title is reserved'),
    fr: french,
    translation: bi,
    tokens: z.array(TokenBindingSchema).min(1),
  })
  .superRefine((sentence, ctx) => {
    const pieces = splitArticle(sentence.fr).flat();
    if (
      !/^[^.!?:\r\n\u2028\u2029…]+[.!?]$/u.test(sentence.fr) ||
      pieces.length !== 1 ||
      pieces[0]?.text !== sentence.fr
    )
      ctx.addIssue({ code: 'custom', path: ['fr'], message: 'Exactly one terminal-punctuated sentence is required' });
    const words = readerWords(sentence.fr);
    if (words.length !== sentence.tokens.length || sentence.tokens.some((token, i) => token.ordinal !== i))
      ctx.addIssue({
        code: 'custom',
        path: ['tokens'],
        message: 'One ordered binding per readerWords ordinal is required',
      });
  });
export type Sentence = z.infer<typeof SentenceSchema>;

// Retain the shared deterministic checker while rejecting unknown fields at every nested boundary.
const feedback = CheckpointQuestionSchema.shape.feedback;
const message = feedback.shape.correct.safeExtend({ summary: bi, detail: bi.optional() }).strict();
const question = CheckpointQuestionSchema.safeExtend({
  instruction: bi,
  prompt: french,
  expectedAnswer: french,
  acceptableAnswers: z.array(french).optional(),
  feedback: feedback
    .safeExtend({
      correct: message,
      incorrect: message,
      byAnswer: z.array(z.strictObject({ answer: french, message })).optional(),
    })
    .strict(),
}).strict();
export const ReaderQuestionSchema = z.strictObject({
  question,
  evidence: z.strictObject({ sentenceId: slug, quote: french }),
});
export type ReaderQuestion = z.infer<typeof ReaderQuestionSchema>;

export const ReaderLearningSchema = z
  .strictObject({
    instruction: bi,
    checkpoints: z
      .array(
        z.strictObject({
          id: slug,
          title: bi,
          questions: z.tuple([ReaderQuestionSchema, ReaderQuestionSchema]),
        }),
      )
      .min(1)
      .max(2),
  })
  .superRefine((learning, ctx) => {
    const ids: string[] = [];
    learning.checkpoints.forEach((checkpoint, i) => {
      ids.push(checkpoint.id);
      checkpoint.questions.forEach(({ question: item }, j) => {
        ids.push(item.id);
        if (item.type !== (j === 0 ? 'CHOICE_SELECT' : 'FILL_BLANKS'))
          ctx.addIssue({
            code: 'custom',
            path: ['checkpoints', i, 'questions', j],
            message: 'Recognition must precede typed production',
          });
      });
    });
    unique(ids, ctx, ['checkpoints']);
  });
export type ReaderLearning = z.infer<typeof ReaderLearningSchema>;

/** Exact surface extraction only; private atom expansion/attestation belongs to the authoring gates. */
function containsAnswer(source: string, quote: string, answer: string) {
  if (!quote) return false;
  const words = readerWords(source);
  for (let offset = source.indexOf(quote); offset !== -1; offset = source.indexOf(quote, offset + 1)) {
    if (
      words.some((word) =>
        [word.start, word.start + word.prefix.length].some(
          (start) =>
            start >= offset &&
            words.some(
              (end) => end.end <= offset + quote.length && end.end > start && source.slice(start, end.end) === answer,
            ),
        ),
      )
    )
      return true;
  }
  return false;
}

export const ReaderBodySchema = z
  .strictObject({
    id: slug,
    order: z.number().int().min(1).max(12),
    level: z.literal('A1'),
    title: z.strictObject({ fr: french, en: english, zh: chinese }),
    topics: z.array(slug).min(1),
    sentences: z.array(SentenceSchema).min(3),
    glossary: z.array(ReaderGlossaryEntrySchema).min(1),
    learning: ReaderLearningSchema,
  })
  .superRefine((body, ctx) => {
    unique(body.topics, ctx, ['topics']);
    unique(
      body.sentences.map((sentence) => sentence.id),
      ctx,
      ['sentences'],
    );
    unique(
      body.glossary.map((entry) => entry.id),
      ctx,
      ['glossary'],
    );
    unique(
      body.glossary.map((entry) => JSON.stringify([entry.pos, normalizeLookupToken(entry.lemma), entry.sense])),
      ctx,
      ['glossary'],
    );
    const entries = new Set(body.glossary.map((entry) => entry.id));
    body.sentences.forEach((sentence, i) =>
      sentence.tokens.forEach((token, j) =>
        token.entryIds.forEach((id, k) => {
          if (!entries.has(id))
            ctx.addIssue({
              code: 'custom',
              path: ['sentences', i, 'tokens', j, 'entryIds', k],
              message: 'Binding must resolve locally',
            });
        }),
      ),
    );
    const roundTrip = splitArticle(body.sentences.map((sentence) => sentence.fr).join('\n')).flat();
    if (
      roundTrip.length !== body.sentences.length ||
      roundTrip.some((piece, i) => piece.text !== body.sentences[i]?.fr)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['sentences'],
        message: 'Sentence order must round-trip through splitArticle',
      });
    body.learning.checkpoints.forEach((checkpoint, i) =>
      checkpoint.questions.forEach(({ question: item, evidence }, j) => {
        const path = ['learning', 'checkpoints', i, 'questions', j, 'evidence'];
        const sentence = body.sentences.find((candidate) => candidate.id === evidence.sentenceId);
        if (!sentence?.fr.includes(evidence.quote))
          ctx.addIssue({ code: 'custom', path, message: 'Evidence must quote its sentence exactly' });
        if (
          sentence &&
          [item.expectedAnswer, ...(item.acceptableAnswers ?? [])].some(
            (answer) => !containsAnswer(sentence.fr, evidence.quote, answer),
          )
        )
          ctx.addIssue({
            code: 'custom',
            path,
            message: 'Every answer must be extractable as whole words from the evidence',
          });
      }),
    );
  });
export type ReaderBody = z.infer<typeof ReaderBodySchema>;

const review = z.strictObject({ contentHash: hash, reviewedBy: text, reviewedAt: z.iso.date() });
export const PublishedReaderSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    body: ReaderBodySchema,
    version: hash,
    review,
  })
  .superRefine((reader, ctx) => {
    if (reader.version !== reader.review.contentHash)
      ctx.addIssue({
        code: 'custom',
        path: ['review', 'contentHash'],
        message: 'Review hash must equal the published version',
      });
  });
export type PublishedReader = z.infer<typeof PublishedReaderSchema>;

export const StageSchema = z
  .strictObject({
    order: z.number().int().min(1).max(12),
    readerId: slug,
    theme: slug,
    topicIds: z.array(slug).min(1),
    allowedTenses: z.array(z.enum(['present', 'imperatif', 'passeCompose', 'imparfait', 'futur'])).min(1),
    allowedConstructions: z.array(z.enum(['modal-infinitive', 'near-future', 'recent-past'])),
    newWordBudget: z.number().int().min(0).max(20),
    maxSentenceWords: z.number().int().positive(),
    maxTextWords: z.number().int().positive(),
    maxSentences: z.number().int().min(3),
    include: z.boolean(),
    bundled: z.boolean(),
  })
  .superRefine((stage, ctx) => {
    for (const field of ['topicIds', 'allowedTenses', 'allowedConstructions'] as const)
      unique(stage[field], ctx, [field]);
    if (!stage.allowedTenses.includes('present'))
      ctx.addIssue({ code: 'custom', path: ['allowedTenses'], message: 'Present must always be allowed' });
    if (stage.bundled && !stage.include)
      ctx.addIssue({ code: 'custom', path: ['bundled'], message: 'Bundled implies included' });
  });
export type Stage = z.infer<typeof StageSchema>;

const semver = text.regex(/^\d+\.\d+\.\d+$/);
export const ReaderSyllabusSchema = z
  .strictObject({
    syllabusVersion: semver,
    stages: z.array(StageSchema).length(12),
  })
  .superRefine((syllabus, ctx) => {
    unique(
      syllabus.stages.map((stage) => stage.readerId),
      ctx,
      ['stages'],
    );
    syllabus.stages.forEach((stage, i) => {
      const fail = (field: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: ['stages', i, field], message });
      if (stage.order !== i + 1) fail('order', 'Stages must be ordered exactly 1 through 12');
      const previous = syllabus.stages[i - 1];
      if (!previous) return;
      for (const field of ['include', 'bundled'] as const)
        if (stage[field] && !previous[field]) fail(field, 'Enabled stages must form a prefix');
      for (const field of ['newWordBudget', 'maxSentenceWords', 'maxTextWords', 'maxSentences'] as const)
        if (stage[field] < previous[field]) fail(field, 'Caps must be monotone');
    });
  });
export type ReaderSyllabus = z.infer<typeof ReaderSyllabusSchema>;

export const ReaderReviewsSchema = z.strictObject({
  records: z.array(review.safeExtend({ readerId: slug })),
});
export type ReaderReviews = z.infer<typeof ReaderReviewsSchema>;

/** The bundled starter export: strict at every level, so no private annotation can ride along. */
export const StarterFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  syllabusVersion: semver,
  readers: z.array(PublishedReaderSchema),
});
export type StarterFile = z.infer<typeof StarterFileSchema>;
