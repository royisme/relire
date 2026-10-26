/** TEST-only hash assembly/privacy/metadata checks; no real publishing or private language content. */
import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { assemble, assertPublicReader, checkMetadata, runAssemble } from '../scripts/graded-readers/assemble';
import { contentHash, policyHash } from '../scripts/graded-readers/gateInputs';
import { markReviews } from '../scripts/graded-readers/review';
import { PublishedReaderSchema } from '../src/types/gradedReader';
import { atomicTestJson, reviewFixture, reviewTestRoot, testReview } from './fixtures/gradedReaderReview';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function publish(fixture: ReturnType<typeof reviewFixture>) {
  return assemble(fixture.drafts, fixture.context.reviews, fixture.context.syllabus, fixture.inputs);
}
function approve(fixture: ReturnType<typeof reviewFixture>) {
  fixture.context.reviews = markReviews(
    [fixture.draft.body.id],
    fixture.drafts,
    fixture.context.reviews,
    fixture.context.syllabus,
    fixture.inputs,
    'TEST reviewer',
  );
}

test('TEST assembly refuses missing/lapsed reviews, missing drafts and gate failures', () => {
  const none = reviewFixture();
  expect(() => publish(none)).toThrow('none review');
  const missing = reviewFixture();
  missing.drafts = [];
  expect(() => publish(missing)).toThrow('expected one private draft, found 0');
  const duplicate = reviewFixture();
  duplicate.drafts.push(duplicate.draft);
  expect(() => publish(duplicate)).toThrow('expected one private draft, found 2');
  const lapsed = reviewFixture();
  approve(lapsed);
  lapsed.draft.body.title.en += ' TEST edit';
  expect(() => publish(lapsed)).toThrow('lapsed review');
  const errors = reviewFixture();
  approve(errors);
  errors.draft.analyses.pop();
  expect(() => publish(errors)).toThrow('exactly one authored analysis');
  const issues = reviewFixture();
  approve(issues);
  issues.draft.issues.push('TEST open issue');
  expect(() => publish(issues)).toThrow();
});

test('TEST assembly emits exactly the public shape, version and review from current records', () => {
  const fixture = reviewFixture(2);
  approve(fixture);
  const readers = publish(fixture);
  expect(readers).toHaveLength(2);
  expect(readers.map((reader) => reader.body.id)).toEqual(fixture.drafts.map((draft) => draft.body.id));
  for (const reader of readers) {
    expect(PublishedReaderSchema.safeParse(reader).success).toBe(true);
    expect(reader.version).toBe(contentHash(reader.body));
    expect(reader.review.contentHash).toBe(reader.version);
    expect(Object.keys(reader).sort()).toEqual(['body', 'review', 'schemaVersion', 'version']);
    const json = JSON.stringify(reader);
    for (const field of [
      'analyses',
      'verbGroups',
      'provenance',
      'issues',
      'promptHash',
      'dependencyHashes',
      'candidates',
      'sourcePath',
    ])
      expect(json).not.toContain(`"${field}"`);
  }
});

test('TEST changed predecessor blocks assembly even when later review matches its unchanged body', () => {
  const fixture = reviewFixture(2);
  approve(fixture);
  const laterHash = contentHash(fixture.draft.body);
  fixture.drafts[0].body.title.en += ' TEST revised predecessor';
  // Re-reviewing the predecessor alone must not approve the old dependency chain downstream.
  fixture.context.reviews.records.push(testReview(fixture.drafts[0]));
  expect(contentHash(fixture.draft.body)).toBe(laterHash);
  expect(() => publish(fixture)).toThrow();
  fixture.draft.provenance.dependencyHashes[0].contentHash = contentHash(fixture.drafts[0].body);
  expect(publish(fixture)).toHaveLength(2);
});

test('TEST publication flags are state, not policy: flipping include or bundled keeps the hash', () => {
  const fixture = reviewFixture();
  const before = policyHash(fixture.context.syllabus, fixture.context.core, 1);
  fixture.context.syllabus.stages[0].include = !fixture.context.syllabus.stages[0].include;
  fixture.context.syllabus.stages[0].bundled = !fixture.context.syllabus.stages[0].bundled;
  expect(policyHash(fixture.context.syllabus, fixture.context.core, 1)).toBe(before);
  fixture.context.syllabus.stages[0].maxSentences += 1;
  expect(policyHash(fixture.context.syllabus, fixture.context.core, 1)).not.toBe(before);
});

test('TEST policy changes lapse review even with unchanged bodies', () => {
  const fixture = reviewFixture();
  approve(fixture);
  fixture.context.syllabus.syllabusVersion = '9.0.0';
  expect(() => publish(fixture)).toThrow();
  fixture.draft.provenance.syllabusHash = policyHash(fixture.context.syllabus, fixture.context.core, 1);
  expect(publish(fixture)).toHaveLength(1);
});

test('TEST strict privacy allowlist catches injected private fields at every depth, not checkpoint prompts', () => {
  const fixture = reviewFixture();
  approve(fixture);
  const [reader] = publish(fixture);
  expect(assertPublicReader(reader)).toEqual(reader);
  for (const field of ['analyses', 'verbGroups', 'provenance', 'issues', 'prompt', 'sourcePaths', 'candidates']) {
    expect(() => assertPublicReader({ ...reader, [field]: 'TEST private' })).toThrow('privacy/schema violation');
    expect(() => assertPublicReader({ ...reader, body: { ...reader.body, [field]: 'TEST private' } })).toThrow(
      'privacy/schema violation',
    );
  }
  const nested = structuredClone(reader);
  Object.assign(nested.body.glossary[0], { candidates: ['TEST private'] });
  expect(() => assertPublicReader(nested)).toThrow('privacy/schema violation');
  Object.assign(fixture.draft.body, { analyses: ['TEST injected private body field'] });
  expect(() => publish(fixture)).toThrow();
});

test('TEST zero included stages is valid and never requests private gate context', () => {
  const fixture = reviewFixture();
  fixture.context.syllabus.stages[0].include = false;
  expect(
    assemble([], { records: [] }, fixture.context.syllabus, () => {
      throw new Error('Must not read private content');
    }),
  ).toEqual([]);
  expect(checkMetadata(fixture.context.syllabus, { records: [] })).toHaveLength(12);
});

test('TEST metadata-only --check works without drafts and rejects unknown ids, missing records and prefix gaps', async () => {
  const fixture = reviewFixture();
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  expect(await Bun.file(join(root, '.local/graded-readers/drafts-1.json')).exists()).toBe(false);
  await rejects(runAssemble(['--check'], root), /included stage 1 has no review record/);
  approve(fixture);
  await atomicTestJson(join(root, 'data/graded-readers/reviews.json'), fixture.context.reviews);
  await runAssemble(['--check'], root);
  expect(() =>
    checkMetadata(fixture.context.syllabus, { records: [{ ...testReview(fixture.draft), readerId: 'test-unknown' }] }),
  ).toThrow('unknown syllabus reader');
  const gap = structuredClone(fixture.context.syllabus);
  gap.stages[2].include = true;
  expect(() => checkMetadata(gap, fixture.context.reviews)).toThrow('Enabled stages must form a prefix');
  await rejects(runAssemble([], root), /Usage/);
  for (const stage of fixture.context.syllabus.stages) stage.include = false;
  await atomicTestJson(join(root, 'data/graded-readers/syllabus.json'), fixture.context.syllabus);
  await atomicTestJson(join(root, 'data/graded-readers/reviews.json'), { records: [] });
  await runAssemble(['--check'], root);
});
