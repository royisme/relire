/** Owner-only by convention: workers must never call mark/unmark. Owns records, not review certification or draft edits. */
import { randomUUID } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ReaderReviewsSchema, type ReaderReviews, type ReaderSyllabus } from '../../src/types/gradedReader';
import { repositoryRoot } from '../grammar-topics/reference';
import type { ReaderDraft } from './drafts';
import { contentHash } from './gateInputs';
import { gateContext, loadReviewInputs, readReviewMetadata, type ReviewContext } from './reviewInputs';
import { requireReady } from './reviewState';

export function markReviews(
  ids: string[],
  drafts: ReaderDraft[],
  reviews: ReaderReviews,
  syllabus: ReaderSyllabus,
  context: ReviewContext,
  by: string,
  kind?: 'ai' | 'human',
): ReaderReviews {
  ReaderReviewsSchema.shape.records.element.shape.reviewedBy.parse(by);
  const result = ReaderReviewsSchema.parse(reviews);
  const reviewedBy = kind ? `${kind === 'ai' ? 'AI' : 'Human'} review: ${by}` : by;
  const reviewedAt = new Date().toISOString().slice(0, 10);
  for (const stage of syllabus.stages.filter((stage) => ids.includes(stage.readerId))) {
    const matches = drafts.filter((draft) => draft.body.id === stage.readerId);
    if (matches.length !== 1) throw new Error(`${stage.readerId}: expected one private draft, found ${matches.length}`);
    const draft = requireReady(matches[0], gateContext(stage, drafts, syllabus, result, context));
    if (draft.body.order !== stage.order)
      throw new Error(`${stage.readerId}: draft order does not match stage ${stage.order}`);
    result.records.push({ readerId: stage.readerId, contentHash: contentHash(draft.body), reviewedBy, reviewedAt });
  }
  return ReaderReviewsSchema.parse(result);
}

export async function review(args: string[], root = repositoryRoot, loadInputs = loadReviewInputs): Promise<void> {
  const [command, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: true,
    options: { by: { type: 'string' }, kind: { type: 'string' } },
  });
  const ids = [...new Set(positionals)];
  if (
    !ids.length ||
    !['mark', 'unmark'].includes(command) ||
    (command === 'mark' && (!values.by?.trim() || !values.kind)) ||
    (values.kind !== undefined && values.kind !== 'ai' && values.kind !== 'human') ||
    (command === 'unmark' && (values.by !== undefined || values.kind !== undefined))
  )
    throw new Error('Usage: review.ts mark <readerId...> --by "<name>" --kind ai|human | unmark <readerId...>');
  const { syllabus, reviews } = await readReviewMetadata(root);
  for (const id of ids)
    if (!syllabus.stages.some((stage) => stage.readerId === id)) throw new Error(`${id}: unknown syllabus reader`);
  let result: ReaderReviews;
  if (command === 'unmark') result = { records: reviews.records.filter((record) => !ids.includes(record.readerId)) };
  else {
    const orders = syllabus.stages.filter((stage) => ids.includes(stage.readerId)).map((stage) => stage.order);
    const inputs = await loadInputs(root, syllabus, orders);
    result = markReviews(
      ids,
      inputs.drafts,
      reviews,
      syllabus,
      inputs.context,
      values.by!,
      values.kind as 'ai' | 'human' | undefined,
    );
  }
  const file = join(root, 'data/graded-readers/reviews.json');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, JSON.stringify(ReaderReviewsSchema.parse(result), null, 2) + '\n');
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
if (import.meta.main) {
  try {
    await review(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
