/** Owns topic and block contracts and structural validation; not content generation or review decisions. */
import { z } from 'zod';
import { ExerciseLevelSchema } from './exercises';
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

export const TopicProvenanceSchema = z.object({
  origin: z.literal('ai-regenerated'),
  referenceSet: text,
  reference: text,
  model: text,
  generatedAt: z.iso.date(),
  promptHash: z.string().regex(/^[0-9a-f]{8}$/),
});

export const GrammarTopicSchema = z
  .object({
    id: slug.refine((id) => !['conjugation', 'gender'].includes(id), 'reserved Grammar section name'),
    level: ExerciseLevelSchema,
    chapter: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
    tags: z.array(GrammarTagSchema).min(1).max(2),
    title: bilingual,
    blocks: z.array(block).min(1),
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
    topic.blocks.forEach((item, i) => {
      if (item.type === 'table') {
        item.rows.forEach((row, j) => {
          if (row.length !== item.header.length) fail(['blocks', i, 'rows', j], 'row width must match header');
        });
      }
      if (item.type === 'examples' && item.items.some((example) => example.speaker !== undefined)) {
        item.items.forEach((example, j) => {
          if (example.speaker === undefined)
            fail(['blocks', i, 'items', j, 'speaker'], 'all examples need a speaker or none');
        });
      }
    });
    const scan = (value: unknown, path: (string | number)[] = []) => {
      if (typeof value === 'string') {
        if (value !== value.normalize('NFC')) fail(path, 'string is not NFC');
        const language = path.at(-1);
        const cjk = /\p{Script=Han}/u.test(value);
        if ((language === 'fr' || language === 'en') && cjk) fail(path, 'CJK is not allowed in French or English');
        if (language === 'zh' && !cjk) fail(path, 'Chinese text needs a CJK character');
        if (language === 'fr' && value.includes("'")) fail(path, 'use the typographic apostrophe U+2019');
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => scan(item, [...path, i]));
      } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) scan(item, [...path, key]);
      }
    };
    scan(topic);
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
