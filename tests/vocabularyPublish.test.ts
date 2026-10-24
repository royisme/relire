/** Synthetic preparation, actual command entrypoints and ordered immutable publication failures on disposable SQLite. */
import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { testBook } from './fixtures/vocabulary';
import { createWorkerDb } from './fixtures/workerDb';
import { failure } from './fixtures/storage';
import {
  prepareVocabulary,
  EMPTY_VOCABULARY_DECISIONS,
  VocabularyDecisionsSchema,
} from '../scripts/vocabulary/prepareBook';
import { prepare } from '../scripts/vocabulary/prepare';
import { review } from '../scripts/vocabulary/review';
import { parseArgs, publish } from '../scripts/vocabulary/publish';
import {
  assembleVocabularyBook,
  publishVocabularyBook,
  vocabularyPages,
  type VocabularyPublishAdapter,
} from '../scripts/vocabulary/publication';
import { vocabularyHash, vocabularyMetadata, canonicalVocabularyJson } from '../src/services/vocabulary/book';
import { VocabularyEntrySchema } from '../src/types/vocabulary';
import { handle } from '../worker/src/index';
test('pure argument parsing accepts only preparation, metadata check and the two local modes', () => {
  for (const args of [[], ['--check'], ['--apply-local'], ['--apply-local-unreviewed']])
    expect(parseArgs(args)).toBe(args[0]);
  for (const args of [
    ['--remote'],
    ['--apply-remote'],
    ['--apply-remote-unreviewed'],
    ['--check', '--apply-local'],
    ['--apply-local', '--apply-local-unreviewed'],
  ])
    expect(() => parseArgs(args)).toThrow('Usage');
});

test.each([undefined, false])(
  'remote permission=%s refuses remote flags with rooted private diagnostics',
  async (allowRemote) => {
    const directory = await mkdtemp(`${tmpdir()}/relire-TEST-vocabulary-failure-`);
    const log = spyOn(console, 'log').mockImplementation(() => {});
    const error = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        await failure(
          publish(['--apply-remote-unreviewed'], pathToFileURL(directory + '/'), undefined, { allowRemote }),
        ),
      ).toMatchObject({ message: expect.stringContaining('Usage') });
      expect(await Bun.file(directory + '/.pi-runs/vocabulary/failure.log').text()).toContain('Usage: publish.ts');
      expect(log.mock.calls).toEqual([]);
      expect(error.mock.calls).toEqual([
        ['Vocabulary publication failed; private diagnostics in .pi-runs/vocabulary/failure.log'],
      ]);
    } finally {
      log.mockRestore();
      error.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const metadata = {
  bookId: 'tcf-7000',
  title: { en: 'TEST book', zh: '\u6d4b\u8bd5' },
};
const sources = [
  {
    id: 1,
    word: "  TEST L'E\u0301cole ",
    pos: '',
    gloss: '\u6d4b\u8bd5',
    gloss_en: 'TEST sense one',
    raw: ['TEST original field', '<p>PRIVATE TEST raw</p>'],
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
test('array raw is opaque; consumed fields and correction/published schemas remain validated', async () => {
  const input = sources.slice(0, 2);
  const original = JSON.stringify(input);
  const result = await prepareVocabulary(input, metadata, EMPTY_VOCABULARY_DECISIONS);
  const withoutRaw = input.map(({ raw: _raw, ...row }) => row);
  expect(result).toEqual(await prepareVocabulary(withoutRaw, metadata, EMPTY_VOCABULARY_DECISIONS));
  expect(JSON.stringify(input)).toBe(original);
  expect(JSON.stringify(result)).not.toContain('PRIVATE TEST raw');
  expect(
    VocabularyDecisionsSchema.safeParse({
      corrections: [{ sourceId: '1', reason: 'TEST forbidden raw', patch: { raw: input[0].raw } }],
      omissions: [],
    }).success,
  ).toBe(false);
  expect(VocabularyEntrySchema.safeParse({ ...result.entries[0], raw: input[0].raw }).success).toBe(false);
  for (const invalid of [{ word: 123 }, { gloss_en: '<p>TEST HTML</p>' }, { gloss: 'TEST not Chinese' }])
    expect(
      await failure(prepareVocabulary([{ ...input[0], ...invalid }], metadata, EMPTY_VOCABULARY_DECISIONS)),
    ).toBeInstanceOf(Error);
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
  const { db, env } = await createWorkerDb();
  const commands: string[] = [];
  const adapter: VocabularyPublishAdapter = {
    execute: async (sql, parameters = []) => {
      commands.push(sql);
      db.query(sql).run(...parameters);
    },
    read: async (sql) => db.query(sql).all() as Record<string, unknown>[],
  };
  try {
    await Bun.write(new URL('data/vocabulary/manifest.json', root), JSON.stringify({ ...metadata, contentHash: null }));
    await Bun.write(new URL('data/vocabulary/reviews.json', root), '{"records":[]}');
    const sourceBytes = JSON.stringify(sources.slice(0, 2));
    await Bun.write(new URL('source.json', root), sourceBytes);
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
    const response = await handle(new Request('https://content.test/v1/vocabulary/tcf-7000?page=0'), env);
    expect(response.status).toBe(200);
    const served = await response.text();
    expect(JSON.parse(served).entries).toHaveLength(1);
    const outputs = [served, commands.join('\n'), JSON.stringify(db.query('SELECT body FROM vocabulary_pages').all())];
    for (const file of ['normalized.json', 'report.json', 'review-sheet.txt', 'publish.sql'])
      outputs.push(await Bun.file(new URL(`.local/vocabulary/${file}`, root)).text());
    for (const output of outputs) {
      expect(output).not.toContain('PRIVATE TEST raw');
      expect(output).not.toContain('TEST original field');
      expect(output).not.toContain('"raw"');
      expect(output).not.toContain('<p>');
    }
    expect(await Bun.file(new URL('source.json', root)).text()).toBe(sourceBytes);
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
async function publicationBook(unreviewed: boolean, count = 1, label = 'TEST') {
  const book = await testBook(count, label);
  if (!unreviewed) return book;
  const { contentHash } = book.manifest.review;
  return assembleVocabularyBook(
    { metadata: vocabularyMetadata(book.manifest), entries: book.entries, contentHash },
    { bookId: 'tcf-7000', contentHash, status: 'unreviewed' },
  );
}
test.each([false, true])(
  'unreviewed=%s: oversized Unicode bodies use short bound SQL without losing content',
  async (unreviewed) => {
    const directory = await mkdtemp(`${tmpdir()}/relire-vocabulary-oversized-`);
    const root = pathToFileURL(directory + '/');
    const { db } = await createWorkerDb();
    const base = await testBook(250);
    const metadata = vocabularyMetadata(base.manifest);
    const quoteText = `TEST '); DROP TABLE meta; -- "quoted" \\ literal`;
    for (const entry of base.entries) {
      entry.senses[0].gloss.zh = '\u6d4b\u8bd5'.repeat(80);
      entry.senses[0].examples = [{ fr: 'TEST l’école.', en: quoteText, zh: '\u6d4b\u8bd5' }];
    }
    const contentHash = await vocabularyHash({ metadata, entries: base.entries });
    const artifact = { metadata, entries: base.entries, contentHash };
    const reviewed = {
      bookId: 'tcf-7000' as const,
      contentHash,
      reviewedBy: 'Synthetic TEST reviewer',
      reviewedAt: '2026-10-20T12:00:00.000Z',
    };
    const book = await assembleVocabularyBook(
      artifact,
      unreviewed ? { bookId: 'tcf-7000', contentHash, status: 'unreviewed' } : reviewed,
    );
    const body = canonicalVocabularyJson(vocabularyPages(book)[0]);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(102_400);
    const commands: string[] = [];
    const boundFailure = new Error('TEST bound write failed');
    let rejectWrite = true;
    const adapter: VocabularyPublishAdapter = {
      execute: async (sql, parameters = []) => {
        commands.push(sql);
        if (new TextEncoder().encode(sql).byteLength > 102_400) throw new Error('TEST SQL statement too long');
        if (sql.startsWith('INSERT OR IGNORE INTO vocabulary_pages')) {
          expect(sql.length).toBeLessThan(200);
          expect(parameters).toEqual(['tcf-7000', book.manifest.version, 0, body]);
          if (rejectWrite) throw boundFailure;
        }
        db.query(sql).run(...parameters);
      },
      read: async (sql) => {
        commands.push(sql);
        if (new TextEncoder().encode(sql).byteLength > 102_400) throw new Error('TEST SQL statement too long');
        return db.query(sql).all() as Record<string, unknown>[];
      },
    };
    const args = [unreviewed ? '--apply-local-unreviewed' : '--apply-local'];
    try {
      await Bun.write(new URL('data/vocabulary/manifest.json', root), JSON.stringify({ ...metadata, contentHash }));
      await Bun.write(new URL('data/vocabulary/reviews.json', root), JSON.stringify({ records: [reviewed] }));
      await Bun.write(new URL('.local/vocabulary/normalized.json', root), JSON.stringify(artifact));
      expect(await failure(publish(args, root, adapter))).toBe(boundFailure);
      expect(db.query('SELECT * FROM vocabulary_pages').all()).toEqual([]);
      expect(db.query("SELECT * FROM meta WHERE key LIKE 'vocabulary%'").all()).toEqual([]);
      rejectWrite = false;
      await publish(args, root, adapter);
      await publish(args, root, adapter);
      expect(db.query('SELECT body FROM vocabulary_pages').all()).toEqual([{ body }]);
      expect(JSON.parse(body).entries).toEqual(base.entries);
      expect(JSON.parse(body).entries[0].senses[0].examples[0].en).toBe(quoteText);
      expect(db.query("SELECT key, value FROM meta WHERE key LIKE 'vocabulary%' ORDER BY key").all()).toEqual([
        { key: 'vocabularyCurrent:tcf-7000', value: book.manifest.version },
        { key: `vocabularyPublished:tcf-7000:${book.manifest.version}`, value: canonicalVocabularyJson(book.manifest) },
      ]);
      expect(Math.max(...commands.map((sql) => new TextEncoder().encode(sql).byteLength))).toBeLessThan(2_000);
      expect(commands.join('\n')).not.toContain(quoteText);
      expect(commands.join('\n')).not.toContain('DROP TABLE');
      expect(commands.join('\n')).not.toContain(body);
      expect(await Bun.file(new URL('.local/vocabulary/publish.sql', root)).text()).toContain('DROP TABLE');
    } finally {
      db.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
test.each([false, true])('unreviewed=%s: safe interruptions and immutable reruns', async (unreviewed) => {
  const old = await testBook(1, 'OLD TEST'),
    next = await publicationBook(unreviewed, 251, 'NEW TEST');
  for (let interrupt = 1; interrupt <= 10; interrupt++) {
    const { db } = await createWorkerDb();
    let step = 0;
    const adapter: VocabularyPublishAdapter = {
      execute: async (sql, parameters = []) => {
        db.query(sql).run(...parameters);
      },
      read: async (sql) => db.query(sql).all() as Record<string, unknown>[],
    };
    try {
      await publishVocabularyBook(old, adapter);
      const failing: VocabularyPublishAdapter = {
        execute: async (sql, parameters = []) => {
          if (++step === interrupt) throw new Error(`TEST interruption ${step}`);
          await adapter.execute(sql, parameters);
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
test.each([false, true])('unreviewed=%s: immutable body and readback gates', async (unreviewed) => {
  const book = await publicationBook(unreviewed);
  for (const mismatch of [true, false]) {
    const { db } = await createWorkerDb();
    const adapter: VocabularyPublishAdapter = {
      execute: async (sql, parameters = []) => {
        db.query(sql).run(...parameters);
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
