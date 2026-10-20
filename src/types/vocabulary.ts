/** Vocabulary content, learner rows and owned metadata contracts; backup pairing lives in storage. */
import { z } from 'zod';
import { vocabularyContextKey, vocabularyId, vocabularyKey } from '../services/vocabulary/identity';

const personalText = z.string().refine((s) => s.trim().length > 0, 'Expected nonblank text');
// Published content is normalized/no-HTML; personal snapshots retain literal source text for React to escape.
const text = personalText.refine(
  (s) => s === s.normalize('NFC') && !/<\/?[a-z][^>]*>/i.test(s),
  'Expected nonblank NFC text',
);
const french = text.refine((s) => !s.includes("'"), 'Expected French curly apostrophes');
const english = text.refine((s) => /\p{Script=Latin}/u.test(s), 'English text needs a Latin letter');
const chinese = text.refine((s) => /\p{Script=Han}/u.test(s), 'Chinese text needs a Han character');
const integer = z.number().int().nonnegative();
const timestamp = z.number().finite().nonnegative();
export const VocabularyHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const VocabularyDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Invalid calendar date');
export const VocabularyRatingSchema = z.union([z.literal(1), z.literal(3), z.literal(4), z.literal(5)]);
export type VocabularyRating = z.infer<typeof VocabularyRatingSchema>;
export const VocabularySenseSchema = z.strictObject({
  pos: text.optional(),
  gloss: z.strictObject({ en: english, zh: chinese }),
  examples: z.array(z.strictObject({ fr: french, en: english, zh: chinese })),
});
export const VocabularyEntrySchema = z
  .strictObject({
    key: text,
    word: french,
    position: integer,
    sourceIds: z.array(text).min(1),
    senses: z.array(VocabularySenseSchema).min(1),
  })
  .refine(
    (entry) => entry.key === vocabularyKey(entry.word) && new Set(entry.sourceIds).size === entry.sourceIds.length,
    'Invalid entry identity',
  );
export const VocabularyReviewSchema = z.strictObject({
  bookId: z.literal('tcf-7000'),
  contentHash: VocabularyHashSchema,
  reviewedBy: text,
  reviewedAt: z.iso.datetime(),
});
export const VocabularyBookMetadataSchema = z.strictObject({
  bookId: z.literal('tcf-7000'),
  title: z.strictObject({ en: english, zh: chinese }),
  attribution: text,
});
export const VocabularyManifestSchema = VocabularyBookMetadataSchema.extend({
  version: VocabularyHashSchema,
  entryCount: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  pageSize: z.literal(250),
  review: VocabularyReviewSchema,
}).refine((m) => m.pageCount === Math.ceil(m.entryCount / m.pageSize), 'Invalid pagination');
export const VocabularyPageSchema = z.strictObject({
  manifest: VocabularyManifestSchema,
  page: integer,
  entries: z.array(VocabularyEntrySchema).max(250),
});
export const VocabularyBookSchema = z.strictObject({
  manifest: VocabularyManifestSchema,
  entries: z.array(VocabularyEntrySchema),
});
export const VocabularyScheduleSchema = z.discriminatedUnion('phase', [
  z.strictObject({
    phase: z.enum(['learning', 'relearning']),
    step: z.union([z.literal(0), z.literal(1)]),
    dueAt: timestamp,
    repetitions: z.literal(0),
    intervalDays: z.literal(0),
    easeFactor: z.number().finite().min(1.3),
  }),
  z.strictObject({
    phase: z.literal('review'),
    dueDate: VocabularyDateSchema,
    repetitions: z.number().int().positive(),
    intervalDays: z.number().int().positive(),
    easeFactor: z.number().finite().min(1.3),
  }),
]);
export const VocabularyAnalysisSchema = z.strictObject({
  word: personalText,
  lemma: z.string(),
  partOfSpeech: z.string(),
  ipa: z.string(),
  phoneticsGuide: z.string(),
  translation: personalText,
  translationEn: personalText.optional(),
  otherMeanings: z.array(personalText).optional(),
  contextTense: z.string().optional(),
  usageExamples: z
    .array(
      z.strictObject({
        fr: personalText,
        zh: personalText,
        en: personalText.optional(),
        highlight: z.string().optional(),
      }),
    )
    .optional(),
  cefrLevel: z.string().optional(),
  memoryTrick: z.string().optional(),
});
export const VocabularyContextSchema = z
  .strictObject({
    id: personalText,
    sentence: z.string(),
    savedAt: timestamp,
    requestLanguage: z.enum(['en', 'zh']),
    source: z.strictObject({ kind: z.enum(['article', 'unit']), id: personalText, title: personalText }).optional(),
    analysis: VocabularyAnalysisSchema,
  })
  .refine((c) => c.id === vocabularyContextKey({ ...c, word: c.analysis.word }), 'Invalid context identity');
export const VocabularyBookSourceSchema = z.strictObject({
  bookId: z.literal('tcf-7000'),
  version: VocabularyHashSchema,
  sourceIds: z.array(text).min(1),
  senses: z.array(VocabularySenseSchema).min(1),
});
export const VocabularyReviewRecordSchema = z.strictObject({
  operationId: text,
  timestamp,
  rating: VocabularyRatingSchema,
  prior: VocabularyScheduleSchema,
  next: VocabularyScheduleSchema,
  revision: z.number().int().positive(),
});
export const VocabularyRowSchema = z
  .strictObject({
    id: text,
    key: text,
    word: french,
    createdAt: timestamp,
    bookSource: VocabularyBookSourceSchema.optional(),
    bookmarked: z.boolean(),
    bookmarkedAt: timestamp.nullable(),
    contexts: z.array(VocabularyContextSchema),
    schedule: VocabularyScheduleSchema.nullable(),
    introducedAt: timestamp.nullable(),
    revision: integer,
    history: z.array(VocabularyReviewRecordSchema),
  })
  .superRefine((row, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (row.key !== vocabularyKey(row.word) || row.id !== vocabularyId(row.key)) invalid('Invalid row identity');
    if (!row.bookSource && !row.contexts.length) invalid('A row needs content');
    if (row.bookmarked !== (row.bookmarkedAt !== null)) invalid('Bookmark and time must agree');
    if ((row.schedule === null) !== (row.introducedAt === null)) invalid('Schedule and introduction must be paired');
    if (!row.schedule && (row.revision || row.history.length)) invalid('Unintroduced row cannot have reviews');
    if (new Set(row.contexts.map((c) => c.id)).size !== row.contexts.length) invalid('Duplicate context');
    if (row.contexts.some((c) => vocabularyKey(c.analysis.word) !== row.key)) invalid('Analysis word mismatch');
    let revision = 0;
    const operations = new Set<string>();
    for (const record of row.history) {
      if (record.revision <= revision || record.revision > row.revision || operations.has(record.operationId))
        invalid('Invalid history revision or operation');
      revision = record.revision;
      operations.add(record.operationId);
    }
  });
export const VocabularyPreferencesSchema = z.strictObject({ newPerDay: z.number().int().min(0).max(100) });
export const VocabularyDaySchema = z
  .strictObject({ date: VocabularyDateSchema, introducedKeys: z.array(text) })
  .refine(
    (day) =>
      new Set(day.introducedKeys).size === day.introducedKeys.length &&
      day.introducedKeys.every((key) => vocabularyKey(key) === key),
    'Invalid daily keys',
  );
export type VocabularyEntry = z.infer<typeof VocabularyEntrySchema>;
export type VocabularyManifest = z.infer<typeof VocabularyManifestSchema>;
export type VocabularyBook = z.infer<typeof VocabularyBookSchema>;
export type VocabularyPage = z.infer<typeof VocabularyPageSchema>;
export type VocabularySchedule = z.infer<typeof VocabularyScheduleSchema>;
export type VocabularyRow = z.infer<typeof VocabularyRowSchema>;
export type VocabularyPreferences = z.infer<typeof VocabularyPreferencesSchema>;
export type VocabularyDay = z.infer<typeof VocabularyDaySchema>;
export type VocabularyBookSource = z.infer<typeof VocabularyBookSourceSchema>;
export interface VocabularyTokens {
  epoch: number;
  resetToken: number;
  revision: number;
}
export interface VocabularyCandidate {
  key: string;
  word: string;
  bookSource?: VocabularyBookSource;
}
