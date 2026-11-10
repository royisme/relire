/** Owns topic and block contracts and structural validation; not content generation or review decisions. */
import { z } from 'zod';
import { ExerciseLevelSchema, refineExerciseItem } from './exercises';
import { CheckpointQuestionSchema, scanTopicStrings } from './grammarCheckpoint';
import { GrammarTagSchema } from './grammar';
import { grammarTopicSlug as slug } from './grammarTagIndex';

const text = z.string().trim().min(1);
const bilingual = z.object({ en: text, zh: text });
const cell = z
  .object({ fr: text.optional(), en: text.optional(), zh: text.optional() })
  .refine((c) => (c.en === undefined) === (c.zh === undefined) && (c.fr ?? c.en) !== undefined, {
    message: 'a cell needs French or a bilingual label, with both gloss languages or neither',
  });
const base = { heading: bilingual.optional() };
const block = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('paragraph'), text: bilingual }),
  z.object({ ...base, type: z.literal('rules'), items: z.array(bilingual).min(1) }),
  z.object({
    ...base,
    type: z.literal('table'),
    header: z.array(cell).min(2).max(8),
    rows: z.array(z.array(cell)).min(1),
    firstColumnIsHeader: z.boolean().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('examples'),
    items: z.array(z.object({ fr: text, en: text, zh: text, speaker: z.enum(['A', 'B']).optional() })).min(1),
  }),
  z.object({ ...base, type: z.literal('note'), text: bilingual }),
]);

const checkpoint = z.object({
  id: slug,
  title: bilingual,
  teaching: z.array(block).min(1),
  questions: z.tuple([CheckpointQuestionSchema, CheckpointQuestionSchema]),
});
const learning = z
  .object({
    instruction: bilingual,
    checkpoints: z.tuple([checkpoint, checkpoint, checkpoint]),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const checkpointIds = new Set<string>();
    value.checkpoints.forEach((entry, i) => {
      const fail = (message: string) => ctx.addIssue({ code: 'custom', path: ['checkpoints', i], message });
      if (checkpointIds.has(entry.id)) fail('Duplicate checkpoint ID');
      checkpointIds.add(entry.id);
      const examples = entry.teaching.reduce(
        (count, item) => count + (item.type === 'examples' ? item.items.length : 0),
        0,
      );
      if (examples > 2) fail('Teaching permits at most two illustrative examples');
      entry.questions.forEach((question, j) => {
        if (ids.has(question.id)) fail('Duplicate question ID');
        ids.add(question.id);
        if (question.type !== (j === 0 ? 'CHOICE_SELECT' : 'FILL_BLANKS'))
          fail('Recognition must precede typed production');
      });
    });
  });

export const TopicProvenanceSchema = z.object({
  origin: z.literal('ai-regenerated'),
  referenceSet: text,
  reference: text,
  model: text,
  generatedAt: z.iso.date(),
  promptHash: z.string().regex(/^[0-9a-f]{8}$/),
});

export const GrammarTopicSummarySchema = z.object({
  id: slug.refine((id) => !['conjugation', 'gender'].includes(id), 'reserved Grammar section name'),
  level: ExerciseLevelSchema,
  chapter: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
  tags: z.array(GrammarTagSchema).min(1).max(2),
  title: bilingual,
});
export type GrammarTopicSummary = z.infer<typeof GrammarTopicSummarySchema>;

// Only the /v1/topics list carries the 1-based manifest position; topics, packs and drafts stay without it.
export const GrammarTopicListEntrySchema = GrammarTopicSummarySchema.extend({
  position: z.number().int().positive(),
});
export type GrammarTopicListEntry = z.infer<typeof GrammarTopicListEntrySchema>;

export const GrammarTopicListSchema = z
  .array(GrammarTopicListEntrySchema)
  .refine((entries) => new Set(entries.map((entry) => entry.position)).size === entries.length, {
    message: 'positions must be unique',
  });
export type GrammarTopicList = z.infer<typeof GrammarTopicListSchema>;

export const GrammarTopicSchema = z
  .object({
    ...GrammarTopicSummarySchema.shape,
    blocks: z.array(block).min(1),
    learning: learning.optional(),
    related: z.array(slug),
    provenance: TopicProvenanceSchema,
    status: z.enum(['draft', 'reviewed']),
    reviewedBy: text.optional(),
    reviewedAt: z.iso.date().optional(),
  })
  .superRefine((topic, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    if (topic.status === 'reviewed') {
      if (!topic.reviewedBy) fail(['reviewedBy'], 'reviewedBy is required when status is reviewed');
      if (!topic.reviewedAt) fail(['reviewedAt'], 'reviewedAt is required when status is reviewed');
    }
    if (new Set(topic.tags).size !== topic.tags.length) fail(['tags'], 'duplicate tag');
    topic.learning?.checkpoints.forEach((entry, i) =>
      entry.questions.forEach((question, j) => {
        refineExerciseItem(
          question.type,
          {
            ...question,
            itemNumber: i * 2 + j + 1,
            grammarTag: topic.tags[0],
          },
          ctx,
          ['learning', 'checkpoints', i, 'questions', j],
        );
      }),
    );
    const blocks = [
      ...topic.blocks.map((item, i) => ({ item, path: ['blocks', i] })),
      ...(topic.learning?.checkpoints.flatMap((entry, i) =>
        entry.teaching.map((item, j) => ({
          item,
          path: ['learning', 'checkpoints', i, 'teaching', j],
        })),
      ) ?? []),
    ];
    blocks.forEach(({ item, path }) => {
      if (item.type === 'table') {
        item.rows.forEach((row, j) => {
          if (row.length !== item.header.length) fail([...path, 'rows', j], 'row width must match header');
        });
      }
      if (item.type === 'examples' && item.items.some((example) => example.speaker !== undefined)) {
        item.items.forEach((example, j) => {
          if (example.speaker === undefined)
            fail([...path, 'items', j, 'speaker'], 'all examples need a speaker or none');
        });
      }
    });
    scanTopicStrings(topic, ctx);
  });
export type GrammarTopic = z.infer<typeof GrammarTopicSchema>;

export const GrammarTopicsPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    topics: z.array(GrammarTopicSchema),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    const ids = new Set(pack.topics.map((topic) => topic.id));
    pack.topics.forEach((topic, i) => {
      const fail = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path: ['topics', i, ...path], message });
      if (seen.has(topic.id)) fail(['id'], `duplicate id ${topic.id}`);
      seen.add(topic.id);
      if (topic.status !== 'reviewed') fail(['status'], `${topic.id}: only reviewed topics ship`);
      topic.related.forEach((id, j) => {
        if (id === topic.id || !ids.has(id)) fail(['related', j], `invalid related topic ${id}`);
      });
    });
  });
export type GrammarTopicsPack = z.infer<typeof GrammarTopicsPackSchema>;
