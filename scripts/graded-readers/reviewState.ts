/** Owns shared review readiness/status; machine gates never certify language quality. */
import type { ReaderReviews } from '../../src/types/gradedReader';
import { ReaderDraftSchema, type ReaderDraft } from './drafts';
import { contentHash, type GateContext } from './gateInputs';
import { metadataGate } from './gateMetadata';
import { checkDraft } from './gates';

export function latestReview(reviews: ReaderReviews, readerId: string) {
  return reviews.records.filter((record) => record.readerId === readerId).at(-1);
}

export function reviewStatus(draft: ReaderDraft, context: GateContext): 'none' | 'current' | 'lapsed' {
  const record = latestReview(context.reviews, draft.body.id);
  if (!record) return 'none';
  if (record.contentHash !== contentHash(draft.body)) return 'lapsed';
  let invalid = false;
  metadataGate(draft, context, () => {
    invalid = true;
  });
  return invalid ? 'lapsed' : 'current';
}

export function requireReady(raw: unknown, context: GateContext): ReaderDraft {
  const draft = ReaderDraftSchema.parse(raw);
  if (draft.issues.length) throw new Error(`${draft.body.id}: open issues: ${draft.issues.join('; ')}`);
  const errors = checkDraft(draft, context).filter((item) => item.severity === 'error');
  if (errors.length)
    throw new Error(
      `${draft.body.id}: ${errors.map((item) => `${item.gate} ${item.targetId}: ${item.reason}`).join('\n')}`,
    );
  return draft;
}
