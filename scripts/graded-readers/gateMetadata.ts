/** Owns G0 input/dependency checks; token/lexical/syntax checks live in their respective gates. */
import { ReaderReviewsSchema, ReaderSyllabusSchema } from '../../src/types/gradedReader';
import { CandidatesSchema, CoreSchema, ReaderDraftSchema, type ReaderDraft } from './drafts';
import { contentHash, GateEvidenceSchema, policyHash, type GateContext } from './gateInputs';
import type { Report } from './diagnostics';
import { targetInventory } from './tokenize';

export function metadataGate(raw: unknown, context: GateContext, report: Report): ReaderDraft | undefined {
  const draftResult = ReaderDraftSchema.safeParse(raw);
  for (const [name, result] of [
    ['draft', draftResult],
    ['syllabus', ReaderSyllabusSchema.safeParse(context.syllabus)],
    ['core', CoreSchema.safeParse(context.core)],
    ['candidates', CandidatesSchema.safeParse(context.candidates)],
    ['reviews', ReaderReviewsSchema.safeParse(context.reviews)],
    ['evidence', GateEvidenceSchema.safeParse(context.evidence)],
  ] as const) {
    if (!result.success)
      for (const issue of result.error.issues) {
        const reason = `${name}.${issue.path.join('.')}: ${issue.message}`;
        report('G0', reason);
        if (
          name === 'draft' &&
          issue.path.some((part) =>
            ['translation', 'gloss', 'learning', 'evidence', 'gender', 'title'].includes(String(part)),
          )
        )
          report('G5', reason);
      }
  }
  if (
    !draftResult.success ||
    !ReaderSyllabusSchema.safeParse(context.syllabus).success ||
    !CoreSchema.safeParse(context.core).success ||
    !CandidatesSchema.safeParse(context.candidates).success ||
    !ReaderReviewsSchema.safeParse(context.reviews).success ||
    !GateEvidenceSchema.safeParse(context.evidence).success
  )
    return;
  const draft = draftResult.data;
  const { body } = draft;
  const stage = context.syllabus.stages[body.order - 1];
  if (stage.readerId !== body.id || contentHash(stage.topicIds) !== contentHash(body.topics))
    report('G0', 'Reader id/order/topics must match its syllabus stage');
  for (const topicId of new Set([...body.topics, ...context.syllabus.stages.flatMap((entry) => entry.topicIds)]))
    if (!context.topicIds.includes(topicId)) report('G0', `Unknown grammar topic: ${topicId}`);
  if (context.candidates.stage !== body.order) report('G0', 'Closed candidate list must match stage');
  if (draft.provenance.syllabusHash !== policyHash(context.syllabus, context.core, body.order))
    report('G0', 'Stale syllabus/core policy hash; rerun gates and review');
  if (draft.issues.length) report('G0', 'Unresolved author/reviewer issues block gates');
  const dependencies: { readerId: string; contentHash: string }[] = [];
  for (const earlier of context.syllabus.stages.slice(0, body.order - 1)) {
    if (!earlier.include) continue;
    const matches = context.previous.filter((reader) => reader.body.id === earlier.readerId);
    const previous = matches[0];
    if (
      matches.length !== 1 ||
      !previous ||
      previous.body.order !== earlier.order ||
      !ReaderDraftSchema.safeParse(previous).success ||
      contentHash(previous.body.topics) !== contentHash(earlier.topicIds)
    ) {
      report('G0', `Missing or invalid unique predecessor: ${earlier.readerId}`);
      continue;
    }
    const hash = contentHash(previous.body);
    dependencies.push({ readerId: earlier.readerId, contentHash: hash });
    const latest = context.reviews.records.filter((record) => record.readerId === earlier.readerId).at(-1);
    if (
      latest?.contentHash !== hash ||
      previous.issues.length ||
      previous.provenance.syllabusHash !== policyHash(context.syllabus, context.core, earlier.order) ||
      contentHash(previous.provenance.dependencyHashes) !== contentHash(dependencies.slice(0, -1))
    )
      report('G0', `Predecessor review/dependencies are missing or stale: ${earlier.readerId}`);
  }
  if (contentHash(dependencies) !== contentHash(draft.provenance.dependencyHashes))
    report('G0', 'Dependency hashes must match preceding reviewed bodies in order');
  if (context.previous.some((reader) => !dependencies.some((dependency) => dependency.readerId === reader.body.id)))
    report('G0', 'Extraneous predecessor input');
  const targets = targetInventory(body);
  if (new Set(targets.map((target) => target.id)).size !== targets.length) report('G0', 'Derived target ids collide');
  for (const analysis of draft.analyses)
    if (!targets.some((target) => target.id === analysis.targetId))
      report('G0', 'Analysis target is not in the derived inventory', {
        targetId: analysis.targetId,
        ordinal: analysis.ordinal,
        part: analysis.part,
      });
  return draft;
}
