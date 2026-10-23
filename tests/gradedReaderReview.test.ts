/** TEST-only owner review command coverage; all record writes stay in disposable directories. */
import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { markReviews, review } from '../scripts/graded-readers/review';
import { reviewStatus } from '../scripts/graded-readers/reviewState';
import { gateContext } from '../scripts/graded-readers/reviewInputs';
import { vocabularyHash } from '../src/services/vocabulary/book';
import { ReaderReviewsSchema } from '../src/types/gradedReader';
import { reviewFixture, reviewTestRoot } from './fixtures/gradedReaderReview';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function mark(fixture: ReturnType<typeof reviewFixture>, kind?: 'ai' | 'human') {
  return markReviews(
    [fixture.draft.body.id],
    fixture.drafts,
    fixture.context.reviews,
    fixture.context.syllabus,
    fixture.inputs,
    'TEST reviewer',
    kind,
  );
}

test('TEST mark refuses malformed drafts, gate errors and open issues', () => {
  const malformed = reviewFixture();
  malformed.draft.body.sentences[0].translation.en = '';
  expect(() => mark(malformed)).toThrow();
  const errors = reviewFixture();
  errors.draft.analyses.pop();
  expect(() => mark(errors)).toThrow('exactly one authored analysis');
  const issues = reviewFixture();
  issues.draft.issues.push('TEST unresolved translation');
  expect(() => mark(issues)).toThrow('open issues: TEST unresolved translation');
});

test('TEST mark refuses missing, stale and dependency-mismatched earlier reviews', () => {
  const missing = reviewFixture(2);
  missing.context.reviews.records = [];
  expect(() => mark(missing)).toThrow('Predecessor review/dependencies are missing or stale');
  const stale = reviewFixture(2);
  stale.context.previous[0].body.title.en += ' TEST edit';
  expect(() => mark(stale)).toThrow('Predecessor review/dependencies are missing or stale');
  const dependency = reviewFixture(2);
  dependency.draft.provenance.dependencyHashes[0].contentHash = 'a'.repeat(64);
  expect(() => mark(dependency)).toThrow('Dependency hashes must match');
  const missingDraft = reviewFixture(2);
  missingDraft.drafts.shift();
  expect(() => mark(missingDraft)).toThrow('Missing or invalid unique predecessor');
});

test('TEST record hashes use the canonical vocabulary hash and body edits lapse reviews', async () => {
  const fixture = reviewFixture();
  const reviews = mark(fixture);
  expect(reviews.records[0].contentHash).toBe(await vocabularyHash(fixture.draft.body));
  expect(reviews.records[0].reviewedBy).toBe('TEST reviewer');
  const context = { ...fixture.context, reviews };
  expect(reviewStatus(fixture.draft, context)).toBe('current');
  fixture.draft.provenance.model = 'TEST another model';
  expect(reviewStatus(fixture.draft, context)).toBe('current');
  fixture.draft.body.sentences[0].translation.en += ' TEST edit';
  expect(reviewStatus(fixture.draft, context)).toBe('lapsed');
});

test('TEST latest record wins, and a changed predecessor invalidates a later matching body hash', () => {
  const fixture = reviewFixture(2);
  const reviews = mark(fixture);
  const current = () =>
    gateContext(fixture.context.syllabus.stages[1], fixture.drafts, fixture.context.syllabus, reviews, fixture.inputs);
  expect(reviewStatus(fixture.draft, current())).toBe('current');
  fixture.drafts[0].body.title.en += ' TEST predecessor edit';
  expect(reviewStatus(fixture.draft, current())).toBe('lapsed');
  reviews.records.push({ ...reviews.records.at(-1)!, contentHash: 'f'.repeat(64) });
  expect(reviewStatus(fixture.draft, current())).toBe('lapsed');
});

test('TEST mark CLI requires --by, preserves free text, prefixes --kind, appends and unmarks atomically', async () => {
  const fixture = reviewFixture();
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  const load = async () => ({ drafts: fixture.drafts, context: fixture.inputs });
  const id = fixture.draft.body.id;
  await rejects(review(['mark', id, '--by', 'TEST', '--kind', 'ai'], root), /expected one private draft, found 0/);
  for (const args of [
    ['mark', id],
    ['mark', id, '--by', 'TEST'],
    ['mark', id, '--by', ' '],
    ['mark', id, '--by', 'TEST', '--kind', 'robot'],
    ['mark', 'unknown-test', '--by', 'TEST'],
    ['unmark', id, '--by', 'TEST'],
  ])
    await rejects(review(args, root, load));
  const file = join(root, 'data/graded-readers/reviews.json');
  expect(ReaderReviewsSchema.parse(await Bun.file(file).json()).records).toEqual([]);
  await review(['mark', id, '--kind', 'ai', '--by', 'TEST Model / family'], root, load);
  await review(['mark', id, '--by', 'TEST Person', '--kind', 'human'], root, load);
  const records = ReaderReviewsSchema.parse(await Bun.file(file).json()).records;
  expect(records.map((record) => record.reviewedBy)).toEqual([
    'AI review: TEST Model / family',
    'Human review: TEST Person',
  ]);
  expect(records[0].reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await readdir(join(root, 'data/graded-readers'))).toEqual(['reviews.json', 'syllabus.json']);
  fixture.draft.issues.push('TEST blocking issue');
  const before = await Bun.file(file).text();
  await rejects(review(['mark', id, '--by', 'TEST', '--kind', 'ai'], root, load), /open issues/);
  expect(await Bun.file(file).text()).toBe(before);
  await review(['unmark', id], root, load);
  expect(ReaderReviewsSchema.parse(await Bun.file(file).json()).records).toEqual([]);
});

test('TEST multi-reader mark validates in syllabus order and never partially writes on failure', async () => {
  const fixture = reviewFixture(2);
  fixture.context.reviews.records = [];
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  const load = async () => ({ drafts: fixture.drafts, context: fixture.inputs });
  const file = join(root, 'data/graded-readers/reviews.json');
  fixture.draft.issues.push('TEST later failure');
  await rejects(
    review(
      ['mark', ...fixture.drafts.map((draft) => draft.body.id).reverse(), '--by', 'TEST', '--kind', 'ai'],
      root,
      load,
    ),
    /open issues/,
  );
  expect(ReaderReviewsSchema.parse(await Bun.file(file).json()).records).toEqual([]);
  fixture.draft.issues = [];
  await review(
    ['mark', ...fixture.drafts.map((draft) => draft.body.id).reverse(), '--by', 'TEST', '--kind', 'ai'],
    root,
    load,
  );
  expect(ReaderReviewsSchema.parse(await Bun.file(file).json()).records.map((record) => record.readerId)).toEqual(
    fixture.drafts.map((draft) => draft.body.id),
  );
});
