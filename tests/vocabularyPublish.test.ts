/** Synthetic preparation, actual command entrypoints and ordered immutable publication failures on disposable SQLite. */
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { testBook } from './fixtures/vocabulary';
import { createWorkerDb } from './fixtures/workerDb';
import { failure } from './fixtures/storage';
import { prepareVocabulary, EMPTY_VOCABULARY_DECISIONS } from '../scripts/vocabulary/prepareBook';
import { prepare } from '../scripts/vocabulary/prepare';
import { review } from '../scripts/vocabulary/review';
import { publish } from '../scripts/vocabulary/publish';
import { publishVocabularyBook, type VocabularyPublishAdapter } from '../scripts/vocabulary/publication';
import { vocabularyHash, canonicalVocabularyJson } from '../src/services/vocabulary/book';
const metadata = {
  bookId: 'tcf-7000',
  title: { en: 'TEST book', zh: '\u6d4b\u8bd5' },
  attribution: 'Invented TEST only',
};
const sources = [
  {
    id: 1,
    word: "  TEST L'E\u0301cole ",
    pos: '',
    gloss: '\u6d4b\u8bd5',
    gloss_en: 'TEST sense one',
    raw: '<p>PRIVATE TEST raw</p>',
    tags: [],
  },
  {
    id: 2,
    word: 'test l’école',
    pos: 'nom',
    gloss: '\u6d4b\u8bd5',
    gloss_en: 'TEST sense two',
    example: { fr: 'TEST exemple.', en: 'TEST example.', zh: '\u6d4b\u8bd5' },
  },
  {
    id: 3,
    word: 'test autre',
    pos: 'nom',
    gloss: '\u6d4b\u8bd5',
    gloss_en: 'TEST other',
    example: { fr: 'Partial TEST' },
  },
];
test('grouping preserves senses/order/ids; absent POS/examples omitted; partial examples require recorded decisions', async () => {
  expect(await failure(prepareVocabulary(sources, metadata, EMPTY_VOCABULARY_DECISIONS))).toBeInstanceOf(Error);
  const result = await prepareVocabulary(sources, metadata, {
    corrections: [],
    omissions: [{ kind: 'example', sourceId: '3', reason: 'TEST partial omission' }],
  });
  expect(result.entries).toHaveLength(2);
  expect(result.entries[0].sourceIds).toEqual(['1', '2']);
  expect(result.entries[0].senses).toHaveLength(2);
  expect(result.entries[0].senses[0].pos).toBeUndefined();
  expect(result.entries[0].senses[0].examples).toEqual([]);
  expect(result.report).toMatchObject({
    sourceRows: 3,
    canonicalGroups: 2,
    missingPos: 1,
    missingExamples: 1,
    partialExamples: 1,
    conflictingSenses: 1,
    omittedExamples: 1,
  });
  expect(JSON.stringify(result)).not.toContain('PRIVATE TEST raw');
  const omitted = await prepareVocabulary(sources, metadata, {
    corrections: [{ sourceId: '1', reason: 'TEST correction', patch: { pos: 'nom' } }],
    omissions: [
      { kind: 'entry', key: 'test autre', reason: 'TEST entry omission' },
      { kind: 'sense', sourceId: '2', reason: 'TEST sense omission' },
    ],
  });
  expect(omitted.report).toMatchObject({ omittedEntries: 1, omittedSenses: 1, corrections: 1 });
  expect(omitted.entries[0].senses).toHaveLength(1);
  expect(omitted.entries[0].senses[0].pos).toBe('nom');
  expect(sources[0].pos).toBe('');
});
test('canonical hash sorts object keys by code point, retains array order, and separates content from review/served version', async () => {
  expect(canonicalVocabularyJson({ '\u{10000}': 1, '\ue000': 2 })).toBe('{"\ue000":2,"\u{10000}":1}');
  expect(await vocabularyHash({ b: 2, a: 1 })).toBe(await vocabularyHash({ a: 1, b: 2 }));
  expect(await vocabularyHash([1, 2])).not.toBe(await vocabularyHash([2, 1]));
  const a = await testBook();
  expect(a.manifest.version).not.toBe(a.manifest.review.contentHash);
});
test('real prepare/review/publish commands work on disposable invented metadata, invalidate changed content and need absolute source', async () => {
  const directory = await mkdtemp(`${tmpdir()}/relire-vocabulary-test-`);
  const root = pathToFileURL(directory + '/');
  const { db } = await createWorkerDb();
  const adapter: VocabularyPublishAdapter = {
    execute: async (sql) => {
      db.exec(sql);
    },
    read: async (sql) => db.query(sql).all() as Record<string, unknown>[],
  };
  try {
    await Bun.write(new URL('data/vocabulary/manifest.json', root), JSON.stringify({ ...metadata, contentHash: null }));
    await Bun.write(new URL('data/vocabulary/reviews.json', root), '{"records":[]}');
    await Bun.write(new URL('source.json', root), JSON.stringify(sources.slice(0, 2)));
    expect(await failure(prepare(['--source', 'source.json'], root))).toBeInstanceOf(Error);
    await prepare(['--source', directory + '/source.json'], root);
    expect(await failure(publish([], root))).toBeInstanceOf(Error);
    await review(['mark', '--by', 'Synthetic TEST reviewer'], root);
    await publish(['--check'], root);
    await publish(['--apply-local'], root, adapter);
    const current = db.query("SELECT value FROM meta WHERE key = 'vocabularyCurrent:tcf-7000'").get() as {
      value: string;
    };
    expect(current.value).toHaveLength(64);
    const first = await Bun.file(new URL('.local/vocabulary/normalized.json', root)).json();
    await review(['mark', '--by', 'Synthetic TEST reviewer two'], root);
    await publish(['--apply-local'], root, adapter);
    expect(
      (db.query("SELECT value FROM meta WHERE key = 'vocabularyCurrent:tcf-7000'").get() as { value: string }).value,
    ).not.toBe(current.value);
    await Bun.write(new URL('source.json', root), JSON.stringify([{ ...sources[0], gloss_en: 'Changed TEST' }]));
    await prepare(['--source', directory + '/source.json'], root);
    expect((await Bun.file(new URL('.local/vocabulary/normalized.json', root)).json()).contentHash).not.toBe(
      first.contentHash,
    );
    expect(await failure(publish(['--apply-local'], root, adapter))).toBeInstanceOf(Error);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('interrupt before every actual adapter command: current always complete, old rows retained, rerun immutable/idempotent', async () => {
  const old = await testBook(1, 'OLD TEST'),
    next = await testBook(251, 'NEW TEST');
  for (let interrupt = 1; interrupt <= 10; interrupt++) {
    const { db } = await createWorkerDb();
    let step = 0;
    const adapter: VocabularyPublishAdapter = {
      execute: async (sql) => {
        db.exec(sql);
      },
      read: async (sql) => db.query(sql).all() as Record<string, unknown>[],
    };
    try {
      await publishVocabularyBook(old, adapter);
      const failing: VocabularyPublishAdapter = {
        execute: async (sql) => {
          if (++step === interrupt) throw new Error(`TEST interruption ${step}`);
          await adapter.execute(sql);
        },
        read: async (sql) => {
          if (++step === interrupt) throw new Error(`TEST interruption ${step}`);
          return adapter.read(sql);
        },
      };
      expect(await failure(publishVocabularyBook(next, failing))).toBeInstanceOf(Error);
      const pointer = (await adapter.read("SELECT value FROM meta WHERE key = 'vocabularyCurrent:tcf-7000'"))[0]
        .value as string;
      const current = pointer === next.manifest.version ? next : old;
      expect(await adapter.read(`SELECT body FROM vocabulary_pages WHERE version = '${pointer}'`)).toHaveLength(
        current.manifest.pageCount,
      );
      expect(
        await adapter.read(`SELECT body FROM vocabulary_pages WHERE version = '${old.manifest.version}'`),
      ).toHaveLength(1);
      await publishVocabularyBook(next, adapter);
      await publishVocabularyBook(next, adapter);
      expect(
        await adapter.read(`SELECT body FROM vocabulary_pages WHERE version = '${next.manifest.version}'`),
      ).toHaveLength(2);
    } finally {
      db.close();
    }
  }
});
test('same-version body mismatch or readback corruption prevents marker/switch and never overwrites staged evidence', async () => {
  const book = await testBook();
  for (const mismatch of [true, false]) {
    const { db } = await createWorkerDb();
    const adapter: VocabularyPublishAdapter = {
      execute: async (sql) => {
        db.exec(sql);
      },
      read: async (sql) => {
        const rows = db.query(sql).all() as Record<string, unknown>[];
        return !mismatch && sql.startsWith('SELECT page,') ? rows.map((row) => ({ ...row, body: '{}' })) : rows;
      },
    };
    try {
      if (mismatch)
        db.query('INSERT INTO vocabulary_pages VALUES (?, ?, 0, ?)').run(
          'tcf-7000',
          book.manifest.version,
          'TEST wrong body',
        );
      expect(await failure(publishVocabularyBook(book, adapter))).toBeInstanceOf(Error);
      expect(db.query("SELECT value FROM meta WHERE key LIKE 'vocabularyPublished:%'").all()).toEqual([]);
      if (mismatch)
        expect((db.query('SELECT body FROM vocabulary_pages').get() as { body: string }).body).toBe('TEST wrong body');
    } finally {
      db.close();
    }
  }
});
