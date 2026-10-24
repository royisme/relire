/** Explicit local waiver provenance and integrity checks use invented content and disposable storage only. */
import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { testBook } from './fixtures/vocabulary';
import { freshDb, failure } from './fixtures/storage';
import { createWorkerDb, workerRequest } from './fixtures/workerDb';
import { prepare } from '../scripts/vocabulary/prepare';
import { review } from '../scripts/vocabulary/review';
import { publish } from '../scripts/vocabulary/publish';
import {
  assembleVocabularyBook,
  publishVocabularyBook,
  type VocabularyPublishAdapter,
} from '../scripts/vocabulary/publication';
import { validateVocabularyBook, vocabularyMetadata } from '../src/services/vocabulary/book';
import { downloadVocabularyBook } from '../src/services/vocabulary/load';
import { getVocabularyBook } from '../src/storage/vocabularyBook';
import { handle } from '../worker/src/index';
import { VocabularyManifestSchema, VocabularyReviewSchema } from '../src/types/vocabulary';
import { PublicVocabularyReviewsSchema } from '../scripts/vocabulary/metadata';

test('manifest accepts only distinct strict reviewed or explicit hash-bound unreviewed provenance', async () => {
  const { manifest } = await testBook();
  const unreviewed = { bookId: 'tcf-7000', contentHash: manifest.review.contentHash, status: 'unreviewed' } as const;
  expect(VocabularyManifestSchema.parse({ ...manifest, review: unreviewed }).review).toEqual(unreviewed);
  expect(VocabularyManifestSchema.parse(manifest)).toEqual(manifest);
  for (const review of [
    null,
    { bookId: 'tcf-7000', contentHash: manifest.review.contentHash },
    { ...unreviewed, contentHash: 'invalid' },
    { ...unreviewed, bookId: 'other' },
    { ...unreviewed, status: 'reviewed' },
    { ...unreviewed, status: 'waived' },
    { ...unreviewed, reviewedBy: 'TEST reviewer' },
    { ...unreviewed, reviewedAt: '2026-10-20T12:00:00.000Z' },
    { ...manifest.review, status: 'unreviewed' },
    { ...manifest.review, status: 'reviewed' },
    { ...unreviewed, extra: true },
  ])
    expect(VocabularyManifestSchema.safeParse({ ...manifest, review }).success).toBe(false);
  expect(VocabularyReviewSchema.safeParse(unreviewed).success).toBe(false);
  expect(PublicVocabularyReviewsSchema.safeParse({ records: [unreviewed] }).success).toBe(false);
});

test('only explicit local mode publishes unreviewed content through Worker/client without changing actual reviews or leaking raw', async () => {
  const directory = await mkdtemp(`${tmpdir()}/relire-vocabulary-unreviewed-`);
  const root = pathToFileURL(directory + '/');
  const { db, env } = await createWorkerDb();
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;
  const messages: string[] = [],
    commands: string[] = [],
    served: string[] = [];
  const log = spyOn(console, 'log').mockImplementation((...args) => {
    messages.push(args.join(' '));
  });
  const adapter: VocabularyPublishAdapter = {
    execute: async (sql, parameters = []) => {
      commands.push(sql);
      db.query(sql).run(...parameters);
    },
    read: async (sql) => {
      commands.push(sql);
      return db.query(sql).all() as Record<string, unknown>[];
    },
  };
  try {
    await freshDb();
    const metadata = vocabularyMetadata((await testBook()).manifest);
    const reviewsFile = Bun.file(new URL('data/vocabulary/reviews.json', root));
    await Bun.write(new URL('data/vocabulary/manifest.json', root), JSON.stringify({ ...metadata, contentHash: null }));
    await Bun.write(reviewsFile, '{"records":[]}\n');
    await publish(['--check'], root);
    expect(await Bun.file(new URL('.local/vocabulary/normalized.json', root)).exists()).toBe(false);
    const sourceBytes = JSON.stringify(
      Array.from({ length: 251 }, (_, id) => ({
        id,
        word: `test-${id}`,
        pos: '',
        gloss: '\u6d4b\u8bd5',
        gloss_en: `TEST meaning ${id}`,
        raw: ['PRIVATE TEST raw', '<p>TEST original field</p>'],
      })),
    );
    await Bun.write(new URL('source.json', root), sourceBytes);
    await prepare(['--source', directory + '/source.json'], root);
    // Deliberately unreadable partial decisions must not be consulted by either publication path.
    await Bun.write(new URL('.local/vocabulary/decisions.json', root), 'TEST incomplete decisions, not JSON');
    for (const args of [[], ['--apply-local']])
      expect(await failure(publish(args, root, adapter))).toMatchObject({
        message: 'Vocabulary requires an actual matching review',
      });
    for (const args of [
      ['--remote'],
      ['--skip-validation'],
      ['--unknown'],
      ['--apply-local-unreviewed', '--remote'],
      ['--apply-local-unreviewed', '--apply-local'],
      ['--check', '--apply-local-unreviewed'],
      ['--apply-local-unreviewed', '--apply-local-unreviewed'],
    ])
      expect(await failure(publish(args, root, adapter))).toMatchObject({
        message: expect.stringMatching(/^Usage: publish\.ts/),
      });
    expect(commands).toEqual([]);
    expect(await Bun.file(new URL('.local/vocabulary/publish.sql', root)).exists()).toBe(false);
    await publish(['--apply-local-unreviewed'], root, adapter);
    expect(await reviewsFile.text()).toBe('{"records":[]}\n');
    for (const args of [[], ['--apply-local']])
      expect(await failure(publish(args, root, adapter))).toMatchObject({
        message: 'Vocabulary requires an actual matching review',
      });
    expect(messages).toContain(
      'Unreviewed vocabulary current pointer verified locally; linguistic review waived for local use',
    );
    process.env.VITE_CONTENT_SERVICE_URL = 'https://content.test';
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      expect(init.credentials).toBe('omit');
      const response = await handle(workerRequest(url, init), env);
      served.push(await response.clone().text());
      return response;
    }) as typeof fetch;
    const book = await downloadVocabularyBook(() => {});
    const artifact = await Bun.file(new URL('.local/vocabulary/normalized.json', root)).json();
    expect(book.entries).toEqual(artifact.entries);
    expect(book.manifest.review).toEqual({
      bookId: 'tcf-7000',
      contentHash: artifact.contentHash,
      status: 'unreviewed',
    });
    expect(served).toHaveLength(2);
    expect(await getVocabularyBook()).toEqual(book);
    // A real matching synthetic review must not silently change this deliberately unreviewed publication.
    await review(['mark', '--by', 'Synthetic TEST reviewer'], root);
    const actualReviews = await reviewsFile.text();
    await publish(['--apply-local-unreviewed'], root, adapter);
    expect(await reviewsFile.text()).toBe(actualReviews);
    expect(await downloadVocabularyBook(() => {})).toEqual(book);
    expect(
      (db.query("SELECT value FROM meta WHERE key = 'vocabularyCurrent:tcf-7000'").get() as { value: string }).value,
    ).toBe(book.manifest.version);
    const outputs = [...served, ...commands, ...messages];
    for (const file of ['normalized.json', 'report.json', 'review-sheet.txt', 'publish.sql'])
      outputs.push(await Bun.file(new URL(`.local/vocabulary/${file}`, root)).text());
    for (const output of outputs) {
      expect(output).not.toContain('PRIVATE TEST raw');
      expect(output).not.toContain('TEST original field');
      expect(output).not.toContain('"raw"');
      expect(output).not.toContain('<p>');
    }
    expect(await Bun.file(new URL('source.json', root)).text()).toBe(sourceBytes);
    expect(messages.join('\n')).not.toContain('TEST meaning');
    const commandCount = commands.length;
    artifact.entries[0].senses[0].gloss.en = 'Changed TEST';
    await Bun.write(new URL('.local/vocabulary/normalized.json', root), JSON.stringify(artifact));
    expect(await failure(publish(['--apply-local-unreviewed'], root, adapter))).toMatchObject({
      message: 'Prepared vocabulary content hash mismatch',
    });
    await Bun.write(
      new URL('.local/vocabulary/normalized.json', root),
      JSON.stringify({ ...artifact, entries: book.entries }),
    );
    await Bun.write(
      new URL('data/vocabulary/manifest.json', root),
      JSON.stringify({ ...metadata, contentHash: 'a'.repeat(64) }),
    );
    expect(await failure(publish(['--apply-local-unreviewed'], root, adapter))).toMatchObject({
      message: 'Vocabulary manifest does not match prepared content',
    });
    expect(commands).toHaveLength(commandCount);
  } finally {
    log.mockRestore();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
    else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('unreviewed provenance changes served version, not content binding or structural validation', async () => {
  const reviewed = await testBook(2);
  const { contentHash } = reviewed.manifest.review;
  const artifact = { metadata: vocabularyMetadata(reviewed.manifest), entries: reviewed.entries, contentHash };
  const review = { bookId: 'tcf-7000' as const, contentHash, status: 'unreviewed' as const };
  const book = await assembleVocabularyBook(artifact, review);
  expect(book.manifest.version).not.toBe(reviewed.manifest.version);
  expect(book.manifest.review.contentHash).toBe(contentHash);
  expect(await validateVocabularyBook(book)).toEqual(book);
  expect(await failure(assembleVocabularyBook(artifact, { ...review, contentHash: 'a'.repeat(64) }))).toBeInstanceOf(
    Error,
  );
  const corruptions = [
    (bad: typeof book) => {
      bad.entries[0].senses[0].gloss.en = 'Changed TEST';
    },
    (bad: typeof book) => {
      bad.entries.reverse();
    },
    (bad: typeof book) => {
      bad.entries[1] = { ...bad.entries[0], position: 2 };
    },
    (bad: typeof book) => {
      bad.entries[1].position = 0;
    },
    (bad: typeof book) => {
      bad.manifest.version = 'a'.repeat(64);
    },
    (bad: typeof book) => {
      bad.manifest.review.contentHash = 'a'.repeat(64);
    },
    (bad: typeof book) => {
      bad.manifest.entryCount++;
    },
    (bad: typeof book) => {
      bad.manifest.pageCount++;
    },
    (bad: typeof book) => {
      Object.assign(bad.entries[0], { raw: 'PRIVATE TEST' });
    },
  ];
  for (const corrupt of corruptions) {
    const bad = structuredClone(book);
    corrupt(bad);
    expect(await failure(validateVocabularyBook(bad))).toBeInstanceOf(Error);
  }
  for (const gate of ['count', 'immutable-marker', 'marker-readback', 'pointer-readback']) {
    const { db } = await createWorkerDb();
    let pointerWrites = 0;
    const adapter: VocabularyPublishAdapter = {
      execute: async (sql, parameters = []) => {
        if (sql.includes('vocabularyCurrent:')) pointerWrites++;
        db.query(sql).run(...parameters);
      },
      read: async (sql) => {
        const rows = db.query(sql).all() as Record<string, unknown>[];
        if (gate === 'count' && sql.startsWith('SELECT page,')) return [];
        if (gate === 'marker-readback' && sql.includes('vocabularyPublished:') && rows.length) return [];
        if (gate === 'pointer-readback' && sql.includes('vocabularyCurrent:')) return [];
        return rows;
      },
    };
    try {
      if (gate === 'immutable-marker')
        db.query('INSERT INTO meta (key, value) VALUES (?, ?)').run(
          `vocabularyPublished:tcf-7000:${book.manifest.version}`,
          'TEST wrong marker',
        );
      const error = await failure(publishVocabularyBook(book, adapter));
      expect(error).toMatchObject({
        message: {
          count: 'Vocabulary stage readback count mismatch',
          'immutable-marker': 'Immutable vocabulary publication mismatch',
          'marker-readback': 'Vocabulary publication marker readback mismatch',
          'pointer-readback': 'Vocabulary current pointer readback mismatch',
        }[gate]!,
      });
      expect(pointerWrites).toBe(gate === 'pointer-readback' ? 1 : 0);
      if (gate !== 'pointer-readback')
        expect(db.query("SELECT value FROM meta WHERE key = 'vocabularyCurrent:tcf-7000'").all()).toEqual([]);
    } finally {
      db.close();
    }
  }
});
