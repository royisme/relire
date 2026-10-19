/** Owns manifest-driven topic assembly and its reviewed-only gate; not generation, review recording or delivery. */
import { z } from 'zod';
import {
  GrammarTopicSchema,
  GrammarTopicsPackSchema,
  GrammarTagIndexSchema,
  type GrammarTopic,
  type GrammarTagIndex,
} from '../../src/types/grammarTopic';
import { TopicReviewsSchema, topicContentHash, type TopicReviews } from './gate';

export const TopicManifestSchema = z
  .object({
    packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    topics: z.array(
      z.object({
        id: GrammarTopicSchema.shape.id,
        level: GrammarTopicSchema.shape.level,
        chapter: GrammarTopicSchema.shape.chapter,
        tags: GrammarTopicSchema.shape.tags,
        related: GrammarTopicSchema.shape.related,
        reference: z.string().trim().min(1),
        include: z.boolean(),
      }),
    ),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    manifest.topics.forEach((topic, i) => {
      if (seen.has(topic.id))
        ctx.addIssue({ code: 'custom', path: ['topics', i, 'id'], message: `duplicate id ${topic.id}` });
      seen.add(topic.id);
    });
  });
export type TopicManifest = z.infer<typeof TopicManifestSchema>;

export interface TopicBuildInputs {
  manifest: TopicManifest;
  drafts: GrammarTopic[];
  reviews: TopicReviews;
}

export function buildTopics({ manifest: rawManifest, drafts: rawDrafts, reviews: rawReviews }: TopicBuildInputs) {
  const manifest = TopicManifestSchema.parse(rawManifest);
  const reviews = TopicReviewsSchema.parse(rawReviews);
  const drafts = z.array(GrammarTopicSchema).parse(rawDrafts);
  const topics: GrammarTopic[] = [];
  const failures: string[] = [];
  const report: string[] = [];
  for (const entry of manifest.topics) {
    if (!entry.include) {
      report.push(`${entry.id}: excluded; skipped`);
      continue;
    }
    const matches = drafts.filter((draft) => draft.id === entry.id);
    if (matches.length !== 1) {
      failures.push(`${entry.id}: expected one draft, found ${matches.length}`);
      continue;
    }
    const { include: _include, reference, ...metadata } = entry;
    const topic = GrammarTopicSchema.parse({
      ...matches[0],
      ...metadata,
      provenance: { ...matches[0].provenance, reference },
      status: 'draft',
      reviewedBy: undefined,
      reviewedAt: undefined,
    });
    // Like conjugation reviews, the latest record supersedes all earlier records for this id.
    const review = [...reviews.records].reverse().find((record) => record.topicId === topic.id);
    if (review && review.contentHash !== topicContentHash(topic)) {
      failures.push(`${topic.id}: review lapsed (content hash changed)`);
    }
    if (review?.contentHash === topicContentHash(topic)) {
      topic.status = 'reviewed';
      topic.reviewedBy = review.reviewedBy;
      topic.reviewedAt = review.reviewedAt;
    } else {
      failures.push(`${topic.id}: publish gate refuses draft; owner review required`);
    }
    topics.push(topic);
  }
  const parsed = GrammarTopicsPackSchema.safeParse({ schemaVersion: 1, packVersion: manifest.packVersion, topics });
  if (!parsed.success)
    failures.push(...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  if (failures.length || !parsed.success) throw new Error([...report, ...failures].join('\n'));
  const tagIndex: GrammarTagIndex = {};
  for (const topic of parsed.data.topics) {
    for (const tag of topic.tags) (tagIndex[tag] ??= []).push(topic.id);
  }
  return { pack: parsed.data, tagIndex: GrammarTagIndexSchema.parse(tagIndex), report };
}

export async function readTopicInputs(): Promise<TopicBuildInputs> {
  const manifest = TopicManifestSchema.parse(
    await Bun.file(new URL('../../data/grammar-topics/manifest.json', import.meta.url)).json(),
  );
  const reviews = TopicReviewsSchema.parse(
    await Bun.file(new URL('../../data/grammar-topics/reviews.json', import.meta.url)).json(),
  );
  const chapters = [...new Set(manifest.topics.filter((topic) => topic.include).map((topic) => topic.chapter))];
  const drafts = (
    await Promise.all(
      chapters.map(async (chapter) =>
        z
          .array(GrammarTopicSchema)
          .parse(await Bun.file(new URL(`../../src/data/grammar/drafts-${chapter}.json`, import.meta.url)).json()),
      ),
    )
  ).flat();
  return { manifest, reviews, drafts };
}
