/** Starter-pack loading end to end: validation, memoisation and retry of the loader itself; hook sessions are in gradedReaderHooks. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import {
  findStarterReader,
  loadedStarterReaders,
  loadStarterReaders,
  resetStarterReadersForTests,
} from '../src/services/gradedReaders/load';
import { publishedReaderFixture } from './fixtures/gradedReaders';

const envelope = (readers: unknown[]) => ({ schemaVersion: 1, syllabusVersion: '0.1.0', readers });
const withVersion = (reader: ReturnType<typeof publishedReaderFixture>, version: string) => ({
  ...reader,
  version,
  review: { ...reader.review, contentHash: version },
});

beforeEach(resetStarterReadersForTests);
afterEach(resetStarterReadersForTests);

test('accepts a valid starter and exposes its readers for pinned lookups', async () => {
  const reader = publishedReaderFixture();
  const pack = await loadStarterReaders(envelope([reader]));
  expect(pack).toEqual([reader]);
  const loaded = loadedStarterReaders()![0]!;
  expect(findStarterReader('test-book')).toBe(loaded);
  expect(findStarterReader('test-book', loaded.version)).toBe(loaded);
  expect(findStarterReader('test-book', '0'.repeat(64))).toBeUndefined();
  expect(findStarterReader('unknown-reader')).toBeUndefined();
});

test('an unloaded pack has no readers to find', () => {
  expect(loadedStarterReaders()).toBeUndefined();
  expect(findStarterReader('test-book')).toBeUndefined();
});

test('loads the committed starter through the real dynamic import and validates every hash', async () => {
  const readers = await loadStarterReaders();
  expect(loadedStarterReaders()).toEqual(readers);
  for (const reader of readers) expect(findStarterReader(reader.body.id, reader.version)).toBe(reader);
});

test('memoises only a successful pack, without re-importing it', async () => {
  const reader = publishedReaderFixture();
  const first = loadStarterReaders(envelope([reader]));
  await first;
  // A later caller gets the same resolved pack even without injected data, so the chunk is imported once.
  expect(loadStarterReaders()).toBe(first);
  expect(loadedStarterReaders()).toEqual([reader]);
});

test('rejects a reader whose published version differs from its body hash', async () => {
  const tampered = structuredClone(publishedReaderFixture());
  tampered.body.title.en = 'TEST: A changed book title';
  await rejects(loadStarterReaders(envelope([tampered])), /version does not match its body hash/);
  expect(loadedStarterReaders()).toBeUndefined();
});

test('rejects a review hash that differs from the published version', async () => {
  const reader = publishedReaderFixture();
  const mismatched = { ...reader, review: { ...reader.review, contentHash: 'b'.repeat(64) } };
  await rejects(loadStarterReaders(envelope([mismatched])), /not usable/);
});

test('rejects a whole pack on a schema error, not just the offending reader', async () => {
  const reader = publishedReaderFixture();
  const privateField = { ...reader, provenance: 'TEST private annotation' };
  await rejects(loadStarterReaders(envelope([reader, privateField])), /provenance/);
  await rejects(loadStarterReaders({ ...envelope([reader]), extra: 'TEST private' }), /extra/);
  expect(loadedStarterReaders()).toBeUndefined();
});

test('a failed load stays retryable and keeps its real error', async () => {
  const failing = withVersion(publishedReaderFixture(), 'c'.repeat(64));
  await rejects(loadStarterReaders(envelope([failing])), /version does not match its body hash/);
  expect(loadedStarterReaders()).toBeUndefined();
  const reader = publishedReaderFixture();
  expect(await loadStarterReaders(envelope([reader]))).toEqual([reader]);
});
