/** Invented TEST-only review workflow inputs; synthetic labels never approve production language content. */
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ReaderReviews } from '../../src/types/gradedReader';
import { contentHash } from '../../scripts/graded-readers/gateInputs';
import type { ReviewContext } from '../../scripts/graded-readers/reviewInputs';
import { gateFixture, setStage } from './gradedReaderGates';

export function reviewFixture(order = 1) {
  const { draft, context } = gateFixture();
  if (order > 1) setStage(draft, context, order);
  const inputs: ReviewContext = (stage) => ({
    ...context,
    candidates: { ...context.candidates, stage: stage.order },
    evidence: { ...context.evidence, topics: stage.topicIds.map((topicId) => ({ topicId, sentenceIds: ['s1'] })) },
  });
  return { draft, context, drafts: [...context.previous, draft], inputs };
}
export function testReview(draft: ReturnType<typeof reviewFixture>['draft']): ReaderReviews['records'][number] {
  return {
    readerId: draft.body.id,
    contentHash: contentHash(draft.body),
    reviewedBy: 'TEST ONLY',
    reviewedAt: '2026-10-23',
  };
}
export async function atomicTestJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, JSON.stringify(value, null, 2) + '\n');
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function reviewTestRoot(fixture: ReturnType<typeof reviewFixture>) {
  const root = await mkdtemp(join(tmpdir(), 'relire-TEST-reader-review-'));
  await atomicTestJson(join(root, 'data/graded-readers/syllabus.json'), fixture.context.syllabus);
  await atomicTestJson(join(root, 'data/graded-readers/reviews.json'), fixture.context.reviews);
  return root;
}
