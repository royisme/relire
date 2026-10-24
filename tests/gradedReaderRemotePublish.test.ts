/** Local reader publication protocol on real in-memory D1 migrations, with labelled invented TEST artifacts only. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkerDb } from './fixtures/workerDb';
import { failure } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import {
  prepareReaderPublication,
  publishReaders,
  type ReaderPublishAdapter,
} from '../scripts/graded-readers/publication';
import { runPublishRemote } from '../scripts/graded-readers/publishRemote';
import { handle } from '../worker/src/index';
import type { Env } from '../worker/src/index';
import syllabus from '../data/graded-readers/syllabus.json';
import * as reviewInputs from '../scripts/graded-readers/reviewInputs';
import { atomicTestJson, reviewFixture, reviewTestRoot, testReview } from './fixtures/gradedReaderReview';

let sqlite: Database;
let env: Env;
let db: ReaderPublishAdapter;
const reader = publishedReaderFixture();
let prepared: Awaited<ReturnType<typeof prepareReaderPublication>>;
const current = () => sqlite.query("SELECT value FROM meta WHERE key = 'readersCurrent'").get() as { value: string };
beforeEach(async () => {
  const created = await createWorkerDb();
  sqlite = created.db;
  env = created.env;
  sqlite.query("INSERT INTO meta (key,value) VALUES ('readersCurrent','TEST old catalogue')").run();
  db = {
    execute: async (sql, parameters = []) => {
      sqlite.query(sql).run(...parameters);
    },
    read: async (sql) => sqlite.query(sql).all() as Record<string, unknown>[],
  };
  prepared = await prepareReaderPublication([reader], '1.0.0');
});
afterEach(() => sqlite.close());

test('stage, exact readback, markers and immutable catalogue precede the sole pointer switch; Worker serves the exact bytes', async () => {
  const events: string[] = [];
  await publishReaders(prepared, {
    execute: async (sql, values) => {
      events.push(`WRITE ${sql} ${values?.[0] ?? ''}`);
      await db.execute(sql, values);
    },
    read: async (sql) => {
      events.push(`READ ${sql}`);
      return db.read(sql);
    },
  });
  const marker = events.findIndex((event) => event.startsWith('WRITE') && event.includes('readerPublished:'));
  expect(events.slice(0, marker).filter((event) => event.startsWith('READ SELECT body'))).toHaveLength(2);
  const pointer = events.findIndex((event) => event.startsWith('WRITE') && event.includes('readersCurrent'));
  expect(pointer).toBe(events.length - 2);
  expect(current().value).toBe(prepared.catalogue.version);
  const response = await handle(
    new Request(`https://content.test/v1/readers/${reader.body.id}?version=${prepared.artifacts[0].hash}`),
    env,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(prepared.artifacts[0].body);
  const list = await handle(new Request('https://content.test/v1/readers'), env);
  expect(await list.json()).toEqual(prepared.catalogue);
});

for (const stop of ['readerPublished:', 'readersCatalog:', 'readersCurrent']) {
  test(`interruption before ${stop} retains old current, and retry is idempotent`, async () => {
    expect(
      await failure(
        publishReaders(prepared, {
          ...db,
          execute: async (sql, values) => {
            if (sql.includes(stop) || values?.some((value) => typeof value === 'string' && value.startsWith(stop)))
              throw new Error('TEST interruption');
            await db.execute(sql, values);
          },
        }),
      ),
    ).toMatchObject({ message: 'TEST interruption' });
    expect(current().value).toBe('TEST old catalogue');
    await publishReaders(prepared, db);
    const before = sqlite.query('SELECT * FROM readers').all();
    await publishReaders(prepared, db);
    expect(sqlite.query('SELECT * FROM readers').all()).toEqual(before);
    expect(current().value).toBe(prepared.catalogue.version);
  });
}

test('every body is verified before any marker, including exact byte and mirrored-column mismatches', async () => {
  for (const changed of [
    { body: prepared.artifacts[0].body + ' ' },
    { body_version: 'b'.repeat(64) },
    { stage_order: 12 },
  ]) {
    let reads = 0;
    expect(
      await failure(
        publishReaders(prepared, {
          ...db,
          read: async (sql) => {
            const rows = await db.read(sql);
            return sql.startsWith('SELECT body') && ++reads === 2 ? [{ ...rows[0], ...changed }] : rows;
          },
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining('readback mismatch') });
    expect(current().value).toBe('TEST old catalogue');
    expect(sqlite.query("SELECT * FROM meta WHERE key LIKE 'readerPublished:%'").all()).toEqual([]);
  }
});

test('immutable collision is an error, never an overwrite or delete', async () => {
  const artifact = prepared.artifacts[0];
  sqlite
    .query('INSERT INTO readers VALUES (?, ?, ?, ?, ?)')
    .run(reader.body.id, artifact.hash, reader.version, 1, 'TEST collision');
  expect(await failure(publishReaders(prepared, db))).toMatchObject({ message: expect.stringContaining('collision') });
  expect(current().value).toBe('TEST old catalogue');
  expect((sqlite.query('SELECT body FROM readers').get() as { body: string }).body).toBe('TEST collision');
});

for (const stop of ['readerPublished:', 'readersCatalog:']) {
  test(`readback mismatch in ${stop} aborts before pointer`, async () => {
    expect(
      await failure(
        publishReaders(prepared, {
          ...db,
          read: async (sql) =>
            sql.includes(stop) && (await db.read(sql)).length ? [{ value: 'TEST corrupt' }] : db.read(sql),
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining('readback mismatch') });
    expect(current().value).toBe('TEST old catalogue');
  });
}

test('strict public allowlist and body hash validation reject private annotations before writes', async () => {
  for (const raw of [
    { ...reader, privateNotes: 'TEST private' },
    { ...reader, body: { ...reader.body, analyses: 'TEST private' } },
    { ...reader, review: { ...reader.review, prompt: 'TEST private' } },
    { ...reader, body: { ...reader.body, title: { ...reader.body.title, en: 'TEST changed' } } },
  ])
    expect(await failure(prepareReaderPublication([raw], '1.0.0'))).toBeInstanceOf(Error);
  expect(prepared.artifacts[0].body).not.toContain('analyses');
  expect(prepared.artifacts[0].body).not.toContain('private');
  expect(prepared.catalogue.readers[0]).not.toHaveProperty('body');
});

test('second artifact verification precedes every marker; interruption before the second marker preserves old current', async () => {
  const other = structuredClone(reader);
  other.body.id = 'test-remote-two';
  other.body.order = 2;
  const { contentHash } = await import('../scripts/graded-readers/gateInputs');
  other.version = other.review.contentHash = contentHash(other.body);
  const pair = await prepareReaderPublication([reader, other], '1.0.0');
  let markers = 0;
  expect(
    await failure(
      publishReaders(pair, {
        ...db,
        execute: async (sql, values) => {
          if (String(values?.[0]).startsWith('readerPublished:') && ++markers === 2)
            throw new Error('TEST second marker interrupted');
          await db.execute(sql, values);
        },
      }),
    ),
  ).toBeInstanceOf(Error);
  expect(markers).toBe(2);
  expect(current().value).toBe('TEST old catalogue');
  await publishReaders(pair, db);
  expect(sqlite.query('SELECT * FROM readers').all()).toHaveLength(2);
  expect(current().value).toBe(pair.catalogue.version);
});

test('CLI SQL uses assembly gates/current reviews/privacy and selects only included non-bundled stages', async () => {
  const fixture = reviewFixture(2);
  fixture.context.syllabus.stages[0].bundled = true;
  fixture.context.reviews.records.push(testReview(fixture.draft));
  const root = await reviewTestRoot(fixture);
  const load = spyOn(reviewInputs, 'loadReviewInputs').mockResolvedValue({
    drafts: fixture.drafts,
    context: fixture.inputs,
  });
  try {
    await runPublishRemote(['--sql'], root);
    expect(load).toHaveBeenCalledWith(root, fixture.context.syllabus, [1, 2]);
    const sql = await Bun.file(join(root, '.local/graded-readers/publish.sql')).text();
    expect(sql).toContain(`VALUES ('${fixture.draft.body.id}',`);
    expect(sql).not.toContain(`VALUES ('${fixture.drafts[0].body.id}',`);
    for (const field of ['analyses', 'verbGroups', 'provenance', 'dependencyHashes', 'sourcePath', 'issues'])
      expect(sql).not.toContain(`"${field}"`);
    expect(sql).not.toContain('readersCurrent');
    fixture.draft.analyses.pop();
    expect(await failure(runPublishRemote(['--sql'], root))).toBeInstanceOf(Error);
    fixture.context.reviews.records = [];
    await atomicTestJson(join(root, 'data/graded-readers/reviews.json'), fixture.context.reviews);
    expect(await failure(runPublishRemote(['--sql'], root))).toBeInstanceOf(Error);
  } finally {
    load.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});

test('zero non-bundled readers is a no-op, including CLI without private files or Wrangler', async () => {
  await publishReaders(await prepareReaderPublication([], '1.0.0'), db);
  expect(current().value).toBe('TEST old catalogue');
  const root = await mkdtemp(join(tmpdir(), 'relire-TEST-remote-publish-'));
  try {
    await Bun.write(
      join(root, 'data/graded-readers/syllabus.json'),
      JSON.stringify({
        ...syllabus,
        stages: syllabus.stages.map((stage) => ({ ...stage, include: false, bundled: false })),
      }),
    );
    await Bun.write(join(root, 'data/graded-readers/reviews.json'), '{"records":[]}');
    await runPublishRemote(['--apply-local'], root);
    await runPublishRemote(['--sql'], root);
    for (const args of [[], ['--remote'], ['--apply-local', '--remote']])
      expect(await failure(runPublishRemote(args, root))).toMatchObject({ message: expect.stringContaining('Usage') });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
