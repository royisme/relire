/** Owns canonical review hashes, review-record contracts and byte-exact artifact checks; not pack assembly. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Verb } from '../../src/types/grammarPack';
import type { GrammarTopic } from '../../src/types/grammarTopic';

const reviewMetadata = {
  reviewedBy: z.string().trim().min(1),
  reviewedAt: z.iso.date(),
};
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const ReviewsSchema = z.object({
  records: z.array(
    z.object({
      verbId: z.string().min(1),
      rowHash: hash,
      ...reviewMetadata,
      reference: z.string().trim().min(1),
    }),
  ),
  rejected: z.array(z.string()),
});
export type Reviews = z.infer<typeof ReviewsSchema>;

export const TopicReviewsSchema = z.object({
  records: z.array(z.object({ topicId: z.string().min(1), contentHash: hash, ...reviewMetadata })),
});
export type TopicReviews = z.infer<typeof TopicReviewsSchema>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function contentHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function rowHash({ prov: _prov, ...row }: Verb): string {
  return contentHash(row);
}

export function topicContentHash({ title, blocks, learning, tags, related, level, chapter }: GrammarTopic): string {
  return contentHash({ title, blocks, learning, tags, related, level, chapter });
}

export async function writeArtifact(url: URL, value: unknown, check: boolean): Promise<void> {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  const output = Bun.file(url);
  if (check) {
    if ((await output.text()) !== bytes)
      throw new Error(`${url.pathname.split('/').at(-1)} differs from the generated pack`);
  } else {
    await Bun.write(output, bytes);
  }
}
