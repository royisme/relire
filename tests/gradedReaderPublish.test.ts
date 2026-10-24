/** TEST-only starter export and artifact checks: committed metadata plus invented readers, never private drafts. */
import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { checkStarter, runPublish, starterFile } from '../scripts/graded-readers/publish';
import { contentHash } from '../scripts/graded-readers/gateInputs';
import type { ReaderSyllabus, StarterFile } from '../src/types/gradedReader';
import { atomicTestJson, reviewFixture, reviewTestRoot } from './fixtures/gradedReaderReview';
import { publishedReaderFixture } from './fixtures/gradedReaders';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function starterFixture() {
  const fixture = reviewFixture();
  fixture.context.syllabus.stages[0].bundled = true;
  const reader = publishedReaderFixture();
  const reviews = {
    records: [
      {
        readerId: reader.body.id,
        contentHash: reader.version,
        reviewedBy: reader.review.reviewedBy,
        reviewedAt: reader.review.reviewedAt,
      },
    ],
  };
  const starter: StarterFile = {
    schemaVersion: 1,
    syllabusVersion: fixture.context.syllabus.syllabusVersion,
    readers: [reader],
  };
  return { fixture, reader, reviews, starter };
}

test('checkStarter accepts a starter that is exactly the reviewed bundled stage', async () => {
  const { fixture, reviews, starter } = starterFixture();
  expect(await checkStarter(starter, fixture.context.syllabus, reviews, 1024)).toBe(1);
  const empty: StarterFile = { ...starter, readers: [] };
  fixture.context.syllabus.stages[0].bundled = false;
  expect(await checkStarter(empty, fixture.context.syllabus, reviews, 64)).toBe(0);
});

test('checkStarter rejects a starter review that diverges from the committed record', async () => {
  const { fixture, reviews, starter } = starterFixture();
  const diverged = { records: [{ ...reviews.records[0]!, contentHash: contentHash('TEST other body') }] };
  await rejects(
    checkStarter(starter, fixture.context.syllabus, diverged, 1024),
    /does not match the current committed record/,
  );
  await rejects(
    checkStarter(starter, fixture.context.syllabus, { records: [] }, 1024),
    /does not match the current committed record/,
  );
});

test('checkStarter rejects a version that is not the canonical body hash', async () => {
  const { fixture, reviews, starter } = starterFixture();
  const forged = {
    ...starter,
    readers: [
      {
        ...starter.readers[0]!,
        version: 'd'.repeat(64),
        review: { ...starter.readers[0]!.review, contentHash: 'd'.repeat(64) },
      },
    ],
  };
  await rejects(checkStarter(forged, fixture.context.syllabus, reviews, 1024), /canonical body hash/);
});

test('checkStarter rejects readers that are not exactly the bundled stages in order', async () => {
  const { fixture, reviews, starter } = starterFixture();
  fixture.context.syllabus.stages[0].bundled = false;
  await rejects(checkStarter(starter, fixture.context.syllabus, reviews, 1024), /must be exactly the bundled stages/);
  const renamed = structuredClone(starter);
  renamed.readers[0]!.body.id = 'test-other-book';
  await rejects(checkStarter(renamed, fixture.context.syllabus, reviews, 1024), /must be exactly the bundled stages/);
});

test('checkStarter rejects private fields, wrong versions and budget overruns', async () => {
  const { fixture, reviews, starter } = starterFixture();
  const annotated = { ...starter, readers: [{ ...starter.readers[0]!, provenance: 'TEST private' }] };
  await rejects(checkStarter(annotated, fixture.context.syllabus, reviews, 1024), /strict public shape/);
  await rejects(
    checkStarter({ ...starter, syllabusVersion: '9.9.9' }, fixture.context.syllabus, reviews, 1024),
    /does not match the committed/,
  );
  await rejects(
    checkStarter({ ...starter, schemaVersion: 2 }, fixture.context.syllabus, reviews, 1024),
    /strict public shape/,
  );
  await rejects(checkStarter(starter, fixture.context.syllabus, reviews, 100 * 1024 + 1), /budget/);
});

test('runPublish writes and re-checks an empty starter when no stage is bundled', async () => {
  const fixture = reviewFixture();
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  expect(await runPublish([], root)).toBe(0);
  const written = (await Bun.file(starterFile(root)).json()) as StarterFile;
  expect(written).toEqual({ schemaVersion: 1, syllabusVersion: fixture.context.syllabus.syllabusVersion, readers: [] });
  expect(await runPublish(['--check'], root)).toBe(0);
});

test('runPublish --check fails on a starter that outruns the bundled stages', async () => {
  const { fixture, reviews, starter } = starterFixture();
  fixture.context.syllabus.stages[0].bundled = false;
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  await atomicTestJson(join(root, 'data/graded-readers/reviews.json'), reviews);
  await atomicTestJson(starterFile(root), starter);
  await rejects(runPublish(['--check'], root), /must be exactly the bundled stages/);
});

test('runPublish refuses to publish a bundled stage without its private draft', async () => {
  const { fixture, reviews } = starterFixture();
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  await atomicTestJson(join(root, 'data/graded-readers/reviews.json'), reviews);
  await rejects(runPublish([], root), /one private draft/);
});

test('runPublish rejects unknown arguments', async () => {
  const fixture = reviewFixture();
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  await rejects(runPublish(['--bogus'], root), /bogus/);
});

test('runPublish --check passes on the committed repository state', async () => {
  expect(await runPublish(['--check'])).toBe(0);
});

test('the committed starter is exactly the bundled stages of the committed syllabus, in order', async () => {
  const root = process.cwd();
  const starter = (await Bun.file(starterFile(root)).json()) as StarterFile;
  const syllabus = (await Bun.file(join(root, 'data/graded-readers/syllabus.json')).json()) as ReaderSyllabus;
  expect(starter.syllabusVersion).toBe(syllabus.syllabusVersion);
  // Publication state changes as readers are reviewed; the starter must always mirror the bundled prefix.
  expect(starter.readers.map((reader) => reader.body.id)).toEqual(
    syllabus.stages.filter((stage) => stage.bundled).map((stage) => stage.readerId),
  );
});
