/**
 * Owns deterministic minimal-pairs pack assembly: the source/review file schemas,
 * the review-hash publish gate and the CLI that writes
 * src/data/minimal-pairs/pairs.json (and checks it byte-for-byte with --check).
 * Does not own the owner review sheet (review.ts) or loading.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PairSchema, MinimalPairsPackSchema } from '../../src/types/minimalPairs';

const slug = z.string().regex(/^[a-z]+(-[a-z]+)*$/);
const rowHashField = z.string().regex(/^[a-f0-9]{64}$/);

export const PairsSourceSchema = z.object({
  packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  pairs: z.array(PairSchema),
});
export type PairsSource = z.infer<typeof PairsSourceSchema>;

/** Review records reference a pair; hashes only, append-only, owner-written. */
export const ReviewsSchema = z.object({
  records: z.array(
    z.strictObject({
      pairId: slug,
      rowHash: rowHashField,
      reviewedBy: z.string().trim().min(1),
      reviewedAt: z.iso.date(),
      reference: z.string().trim().min(1),
    }),
  ),
});
export type Reviews = z.infer<typeof ReviewsSchema>;

export interface BuildInputs {
  source: PairsSource;
  reviews: Reviews;
}

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

/** sha256 of the canonical authored row; a changed row lapses its review. */
export function rowHash(row: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(row)))
    .digest('hex');
}

export function buildPack({ source: rawSource, reviews: rawReviews }: BuildInputs) {
  const source = PairsSourceSchema.parse(rawSource);
  const reviews = ReviewsSchema.parse(rawReviews);
  const failures: string[] = [];
  const pairs = source.pairs.map((pair) => {
    // Records are append-only; the latest review of a pair supersedes earlier reviews.
    const review = [...reviews.records].reverse().find((record) => record.pairId === pair.id);
    const hash = rowHash(pair);
    if (review && review.rowHash !== hash) failures.push(`${pair.id}: review lapsed (row hash changed)`);
    const matching = review?.rowHash === hash ? review : undefined;
    if (!matching) failures.push(`${pair.id}: publish gate refuses draft; human review required`);
    return matching
      ? { ...pair, status: 'reviewed', reviewedBy: matching.reviewedBy, reviewedAt: matching.reviewedAt }
      : { ...pair, status: 'draft' };
  });
  const parsed = MinimalPairsPackSchema.safeParse({ schemaVersion: 1, packVersion: source.packVersion, pairs });
  if (!parsed.success) {
    failures.push(...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  if (failures.length || !parsed.success) throw new Error(failures.join('\n'));
  return parsed.data;
}

export async function readInputs(): Promise<BuildInputs> {
  const [source, reviews] = await Promise.all([
    Bun.file(new URL('../../data/minimal-pairs/pairs.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/minimal-pairs/reviews.json', import.meta.url)).json(),
  ]);
  return { source: PairsSourceSchema.parse(source), reviews: ReviewsSchema.parse(reviews) };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: build.ts [--check]');
  const pack = buildPack(await readInputs());
  const bytes = JSON.stringify(pack, null, 2) + '\n';
  const output = Bun.file(new URL('../../src/data/minimal-pairs/pairs.json', import.meta.url));
  if (args[0] === '--check') {
    if (!(await output.exists())) throw new Error('no committed src/data/minimal-pairs/pairs.json to check against');
    if ((await output.text()) !== bytes) throw new Error('pairs.json differs from the generated pack');
  } else {
    await Bun.write(output, bytes);
  }
}
