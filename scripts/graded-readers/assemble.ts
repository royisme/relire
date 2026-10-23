/** Owns reviewed-only public assembly and metadata-only CI checks, not publication or language certification. */
import {
  PublishedReaderSchema,
  ReaderReviewsSchema,
  ReaderSyllabusSchema,
  type PublishedReader,
  type ReaderReviews,
  type ReaderSyllabus,
} from '../../src/types/gradedReader';
import { repositoryRoot } from '../grammar-topics/reference';
import { ReaderDraftSchema, type ReaderDraft } from './drafts';
import { contentHash } from './gateInputs';
import { gateContext, readReviewMetadata, type ReviewContext } from './reviewInputs';
import { latestReview, requireReady } from './reviewState';

export function checkMetadata(rawSyllabus: unknown, rawReviews: unknown) {
  const syllabus = ReaderSyllabusSchema.parse(rawSyllabus);
  const reviews = ReaderReviewsSchema.parse(rawReviews);
  for (const record of reviews.records)
    if (!syllabus.stages.some((stage) => stage.readerId === record.readerId))
      throw new Error(`${record.readerId}: review names an unknown syllabus reader`);
  for (const stage of syllabus.stages)
    if (stage.include && !latestReview(reviews, stage.readerId))
      throw new Error(`${stage.readerId}: included stage ${stage.order} has no review record`);
  return syllabus.stages.filter((stage) => !stage.include).map((stage) => stage.readerId);
}

/** Strict recursive public schemas are the privacy allowlist; only checkpoint prompts are public. */
export function assertPublicReader(raw: unknown): PublishedReader {
  const parsed = PublishedReaderSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Public reader privacy/schema violation: ${parsed.error.message}`);
  return parsed.data;
}

export function assemble(
  drafts: ReaderDraft[],
  rawReviews: ReaderReviews,
  rawSyllabus: ReaderSyllabus,
  context: ReviewContext,
): PublishedReader[] {
  const syllabus = ReaderSyllabusSchema.parse(rawSyllabus);
  const reviews = ReaderReviewsSchema.parse(rawReviews);
  // Report exclusions without silently dropping an included but failing stage.
  console.log(
    `Excluded readers: ${
      syllabus.stages
        .filter((stage) => !stage.include)
        .map((stage) => stage.readerId)
        .join(', ') || '(none)'
    }`,
  );
  const readers: PublishedReader[] = [];
  for (const stage of syllabus.stages) {
    if (!stage.include) continue;
    const matches = drafts.filter((draft) => draft.body.id === stage.readerId);
    if (matches.length !== 1) throw new Error(`${stage.readerId}: expected one private draft, found ${matches.length}`);
    const draft = ReaderDraftSchema.parse(matches[0]);
    if (draft.body.order !== stage.order)
      throw new Error(`${stage.readerId}: draft order does not match stage ${stage.order}`);
    const record = latestReview(reviews, stage.readerId);
    const hash = contentHash(draft.body);
    if (!record || record.contentHash !== hash)
      throw new Error(`${stage.readerId}: ${record ? 'lapsed' : 'none'} review; current body hash ${hash}`);
    requireReady(draft, gateContext(stage, drafts, syllabus, reviews, context));
    readers.push(
      assertPublicReader({
        schemaVersion: 1,
        body: draft.body,
        version: hash,
        review: { contentHash: record.contentHash, reviewedBy: record.reviewedBy, reviewedAt: record.reviewedAt },
      }),
    );
  }
  return readers;
}

export async function runAssemble(args: string[], root = repositoryRoot): Promise<void> {
  if (args.length !== 1 || args[0] !== '--check') throw new Error('Usage: assemble.ts --check');
  const { syllabus, reviews } = await readReviewMetadata(root);
  const excluded = checkMetadata(syllabus, reviews);
  console.log(
    `Metadata-only check passed (no private drafts read). Excluded readers: ${excluded.join(', ') || '(none)'}`,
  );
}
if (import.meta.main) {
  try {
    await runAssemble(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
