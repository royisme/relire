/** Owns private SQL publication, public metadata checks and publish-to-Worker round trips using TEST fixtures only. */
import { expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPublishSql, checkTopicMetadata, parseArgs, publish } from '../scripts/grammar-topics/publish';
import { buildTopics, type TopicBuildInputs } from '../scripts/grammar-pack/topics';
import { topicContentHash } from '../scripts/grammar-pack/gate';
import { GrammarTopicListSchema, GrammarTopicSchema, type GrammarTopic } from '../src/types/grammarTopic';
import { GrammarTagIndexSchema } from '../src/types/grammarTagIndex';
import { handle } from '../worker/src/index';
import { topicFixture } from './fixtures/grammarTopics';
import { learningFixture } from './fixtures/grammarLearning';
import { createWorkerDb } from './fixtures/workerDb';

function inputs(topics: GrammarTopic[] = [topicFixture()]): TopicBuildInputs {
  return {
    manifest: {
      packVersion: '0.1.0',
      topics: topics.map(({ id, level, chapter, tags, related, provenance }) => ({
        id,
        level,
        chapter,
        tags,
        related,
        reference: provenance.reference,
        include: true,
      })),
    },
    drafts: topics,
    reviews: {
      records: topics.map((topic) => ({
        topicId: topic.id,
        contentHash: topicContentHash(topic),
        reviewedBy: 'TEST ONLY',
        reviewedAt: '2026-10-18',
      })),
    },
  };
}

async function writeInputs(directory: string, input: TopicBuildInputs) {
  await Bun.write(join(directory, 'data/grammar-topics/manifest.json'), JSON.stringify(input.manifest));
  await Bun.write(join(directory, 'data/grammar-topics/reviews.json'), JSON.stringify(input.reviews));
  for (const chapter of new Set(input.drafts.map((topic) => topic.chapter)))
    await Bun.write(
      join(directory, `.local/grammar-topics/drafts-${chapter}.json`),
      JSON.stringify(input.drafts.filter((topic) => topic.chapter === chapter)),
    );
}

function quotingInput() {
  const topic = learningFixture();
  const text = 'TEST "quote" \'single\'\nTEST apostrophe ’ \\path; -- TEST';
  topic.title.en = text;
  const examples = topic.blocks.find((block) => block.type === 'examples')!;
  examples.items[0].en = text;
  examples.items[0].fr = 'TEST "quote"\nTEST ’ \\path';
  Object.assign(topic, { uncertain: ['TEST PRIVATE'], warnings: ['TEST PRIVATE'] });
  return inputs([topic]);
}

test('SQL quotes every value and round trips titles, examples, JSON tags and canonical hashes exactly', async () => {
  const input = quotingInput();
  const { sql, version } = buildPublishSql(input);
  expect(sql).toContain("''single''");
  expect(sql.startsWith("DELETE FROM meta WHERE key = 'packVersion';\nDELETE FROM topics;\n")).toBe(true);
  expect(sql.trimEnd().endsWith(`VALUES ('packVersion', '${version}');`)).toBe(true);
  const { db } = await createWorkerDb();
  try {
    db.exec(sql);
    const topic = buildTopics(input).pack.topics[0];
    const row = db.query('SELECT * FROM topics').get() as Record<string, string | number>;
    expect(row).toEqual({
      id: topic.id,
      chapter: topic.chapter,
      level: topic.level,
      title_en: topic.title.en,
      title_zh: topic.title.zh,
      tags: JSON.stringify(topic.tags),
      body: JSON.stringify(topic),
      content_hash: topicContentHash(topic),
      position: 1,
    });
    const body = row.body as string;
    expect(GrammarTopicSchema.parse(JSON.parse(body))).toEqual(topic);
    expect(JSON.parse(body)).not.toHaveProperty('uncertain');
    expect(JSON.parse(body)).not.toHaveProperty('warnings');
  } finally {
    db.close();
  }
});

test('SQL is id-sorted and byte-deterministic for reordered drafts and reviews; the manifest order owns positions', () => {
  const input = inputs([
    { ...topicFixture(), id: 'test-z' },
    { ...topicFixture(), id: 'test-a' },
  ]);
  const first = buildPublishSql(input);
  input.drafts.reverse();
  input.reviews.records.reverse();
  expect(buildPublishSql(input).sql).toBe(first.sql);
  expect(buildPublishSql(input).version).toBe(first.version);
  input.manifest.topics.reverse();
  const reordered = buildPublishSql(input);
  expect(reordered.sql).not.toBe(first.sql);
  expect(reordered.version).not.toBe(first.version);
  expect(reordered.sql.indexOf("VALUES ('test-a'")).toBeLessThan(reordered.sql.indexOf("VALUES ('test-z'"));
  const lines = [...input.drafts]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((topic, i) => `${topic.id}:${i + 1}:${topicContentHash(topic)}`)
    .join('\n');
  expect(reordered.version).toBe(`0.1.0+${createHash('sha256').update(lines).digest('hex').slice(0, 8)}`);
});

test('positions follow manifest array order, not alphabetical id order', async () => {
  const input = inputs([
    { ...topicFixture(), id: 'test-b' },
    { ...topicFixture(), id: 'test-a' },
    { ...topicFixture(), id: 'test-c' },
  ]);
  const { db } = await createWorkerDb();
  try {
    db.exec(buildPublishSql(input).sql);
    expect(db.query('SELECT id, position FROM topics ORDER BY position').all()).toEqual([
      { id: 'test-b', position: 1 },
      { id: 'test-a', position: 2 },
      { id: 'test-c', position: 3 },
    ]);
  } finally {
    db.close();
  }
});

test('version changes with reviewed content, membership or manifest version, not input ordering or review metadata', () => {
  const input = inputs();
  const original = buildPublishSql(input).version;
  input.reviews.records[0].reviewedBy = 'OTHER TEST OWNER';
  input.drafts[0].provenance.model = 'OTHER TEST MODEL';
  expect(buildPublishSql(input).version).toBe(original);
  input.drafts[0].title.en = 'EDITED TEST';
  input.reviews.records[0].contentHash = topicContentHash(input.drafts[0]);
  expect(buildPublishSql(input).version).not.toBe(original);
  input.manifest.topics[0].include = false;
  expect(buildPublishSql(input).version).not.toBe(original);
  input.manifest.packVersion = '0.2.0';
  expect(buildPublishSql(input).version).toStartWith('0.2.0+');
});

test('learning edits refuse stale publication and change the delivered version only after a matching TEST review', () => {
  const input = inputs([learningFixture()]);
  const before = buildPublishSql(input);
  input.drafts[0].learning!.checkpoints[0].questions[1].feedback.incorrect.summary.en += ' TEST edit';
  expect(() => buildPublishSql(input)).toThrow('review lapsed');
  input.reviews.records[0].contentHash = topicContentHash(input.drafts[0]);
  const after = buildPublishSql(input);
  expect(after.version).not.toBe(before.version);
  expect(after.pack.topics[0].learning).toEqual(input.drafts[0].learning);
});

test('zero topics replaces prior content, emits only delete and version, and lists excluded ids', async () => {
  const input = inputs();
  const { db, env } = await createWorkerDb();
  try {
    db.exec(buildPublishSql(input).sql);
    input.manifest.topics[0].include = false;
    input.drafts = [];
    input.reviews.records = [];
    const empty = buildPublishSql(input);
    expect(empty.report).toEqual(['test-only: excluded; skipped']);
    expect(empty.sql).toBe(
      "DELETE FROM meta WHERE key = 'packVersion';\nDELETE FROM topics;\nINSERT OR REPLACE INTO meta (key, value) VALUES ('packVersion', '0.1.0+e3b0c442');\n",
    );
    expect(buildPublishSql(inputs([])).sql).toBe(empty.sql);
    db.exec(empty.sql);
    expect(await (await handle(new Request('https://content.test/v1/topics'), env)).json()).toEqual([]);
    expect(await (await handle(new Request('https://content.test/v1/tag-index'), env)).json()).toEqual({});
    expect(db.query("SELECT value FROM meta WHERE key = 'packVersion'").get()).toEqual({ value: empty.version });
  } finally {
    db.close();
  }
});

test('publish reuses gate refusal by name for absent reviews, lapsed reviews and missing drafts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-refused-publish-'));
  try {
    const input = inputs();
    input.drafts[0].title.en = 'EDITED TEST';
    expect(() => buildPublishSql(input)).toThrow('test-only: review lapsed');
    input.reviews.records = [];
    expect(() => buildPublishSql(input)).toThrow('test-only: publish gate refuses draft');
    await writeInputs(directory, input);
    const failure = await publish([], pathToFileURL(directory + '/')).then(
      () => 'unexpected success',
      (error: Error) => error.message,
    );
    expect(failure).toContain('test-only: publish gate refuses draft');
    expect(await Bun.file(join(directory, '.local/grammar-topics/publish.sql')).exists()).toBe(false);
    input.drafts = [];
    expect(() => buildPublishSql(input)).toThrow('test-only: expected one draft, found 0');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('private file publish through the real migration and Worker matches the app contracts at all three endpoints', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-publish-'));
  const { db, env } = await createWorkerDb();
  try {
    const input = quotingInput();
    input.drafts.push({ ...topicFixture(), id: 'test-a', tags: ['articles', 'negation'] });
    const two = inputs(input.drafts);
    const expected = buildTopics(two);
    await writeInputs(directory, two);
    const root = pathToFileURL(directory + '/');
    const file = Bun.file(new URL('.local/grammar-topics/publish.sql', root));
    await publish([], root);
    const bytes = await file.text();
    await publish([], root);
    expect(await file.text()).toBe(bytes);
    expect(bytes).toBe(buildPublishSql(two).sql);
    expect((await readdir(new URL('.local/grammar-topics/', root))).sort()).toEqual([
      'drafts-test-only.json',
      'publish.sql',
    ]);
    db.exec(bytes);
    db.exec(bytes); // Reapplying replaces, never appends.
    const request = (path: string) => handle(new Request(`https://content.test${path}`), env);
    const list = await request('/v1/topics');
    expect(list.status).toBe(200);
    expect(GrammarTopicListSchema.parse(await list.json())).toEqual(
      expected.pack.topics.map(({ id, chapter, level, tags, title }, i) => ({
        id,
        chapter,
        level,
        tags,
        title,
        position: i + 1,
      })),
    );
    for (const topic of expected.pack.topics) {
      const response = await request(`/v1/topics/${topic.id}`);
      expect(response.status).toBe(200);
      expect(GrammarTopicSchema.parse(await response.json())).toEqual(topic);
      expect(response.headers.get('ETag')).toBe(`"${buildPublishSql(two).version}"`);
    }
    const index = await request('/v1/tag-index');
    expect(index.status).toBe(200);
    const expectedIndex = Object.fromEntries(
      Object.entries(expected.tagIndex).map(([tag, ids]) => [tag, ids!.toSorted()]),
    );
    expect(GrammarTagIndexSchema.parse(await index.json())).toEqual(expectedIndex);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const labelled = { grammarTopics: { chapters: { 'test-only': 'TEST ONLY' } } };
const locales = { en: labelled, zh: labelled };

test('metadata check validates excluded entries, related ids, review schemas and review membership', () => {
  const input = inputs();
  input.manifest.topics[0].include = false;
  checkTopicMetadata(input.manifest, input.reviews, locales);
  const check = (manifest: unknown, reviews: unknown = input.reviews) => checkTopicMetadata(manifest, reviews, locales);
  expect(() => check({ ...input.manifest, packVersion: 'bad' })).toThrow();
  expect(() => check({ ...input.manifest, topics: [input.manifest.topics[0], input.manifest.topics[0]] })).toThrow(
    'duplicate id test-only',
  );
  for (const tags of [['unknown'], ['articles', 'articles']])
    expect(() => check({ ...input.manifest, topics: [{ ...input.manifest.topics[0], tags }] })).toThrow();
  for (const related of [['missing-test'], ['test-only']])
    expect(() => check({ ...input.manifest, topics: [{ ...input.manifest.topics[0], related }] })).toThrow(
      'invalid related topic',
    );
  expect(() => check(input.manifest, { records: [{ ...input.reviews.records[0], topicId: 'missing-test' }] })).toThrow(
    'missing-test: review names an unknown',
  );
  for (const edit of [{ contentHash: 'bad' }, { reviewedAt: 'bad' }, { reviewedBy: '' }])
    expect(() => check(input.manifest, { records: [{ ...input.reviews.records[0], ...edit }] })).toThrow();
});

test('chapter-label check fails for either missing locale key or a blank label', () => {
  const input = inputs();
  for (const language of ['en', 'zh']) {
    for (const chapters of [{}, { 'test-only': ' ' }])
      expect(() =>
        checkTopicMetadata(input.manifest, input.reviews, {
          ...locales,
          [language]: { grammarTopics: { chapters } },
        }),
      ).toThrow(`${language}: missing grammarTopics.chapters.test-only`);
  }
});

test('--check succeeds with included metadata and no accessible private directory, and writes nothing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-metadata-'));
  try {
    const input = inputs([{ ...topicFixture(), chapter: 'chapter-one' }]);
    await writeInputs(directory, { ...input, drafts: [] });
    await Bun.write(join(directory, '.local'), 'TEST sentinel, not a directory');
    await publish(['--check'], pathToFileURL(directory + '/'));
    expect((await readdir(directory)).sort()).toEqual(['.local', 'data']);
    expect(await Bun.file(join(directory, '.local')).text()).toBe('TEST sentinel, not a directory');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('publish output contains only counts, skipped ids and the path, never fixture text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-publish-output-'));
  const log = spyOn(console, 'log').mockImplementation(() => {});
  try {
    const input = inputs();
    input.manifest.topics.push({ ...input.manifest.topics[0], id: 'test-excluded', include: false });
    await writeInputs(directory, input);
    await publish([], pathToFileURL(directory + '/'));
    expect(log.mock.calls).toEqual([
      ['Skipped: test-excluded'],
      [`1 topics prepared: ${join(directory, '.local/grammar-topics/publish.sql')}`],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(input.drafts[0].title.en);
  } finally {
    log.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

test('pure argument parsing accepts preparation/check and explicit apply modes only', () => {
  for (const args of [[], ['--check'], ['--apply-local'], ['--apply-remote']]) expect(parseArgs(args)).toBe(args[0]);
  for (const args of [
    ['--remote'],
    ['--unknown'],
    ['--apply-remote', '--remote'],
    ['--apply-remote', '--apply-local'],
    ['--apply-remote', '--check'],
    ['--apply-remote', '--apply-remote'],
    ['--check', '--apply-local'],
    ['--check', '--check'],
  ])
    expect(() => parseArgs(args)).toThrow('Usage');
});

test.each([undefined, false])('remote permission=%s refuses before any file access or logging', async (allowRemote) => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-topic-failure-'));
  const log = spyOn(console, 'log').mockImplementation(() => {});
  const error = spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(
      await publish(['--apply-remote'], pathToFileURL(directory + '/'), { allowRemote }).then(
        () => 'resolved',
        (error: Error) => error.message,
      ),
    ).toBe('Remote publication requires owner CLI authorization');
    expect(await readdir(directory)).toEqual([]);
    expect(log.mock.calls).toEqual([]);
    expect(error.mock.calls).toEqual([]);
  } finally {
    log.mockRestore();
    error.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remote CLI refuses non-TTY streams before inputs, output, logs or Wrangler access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-topic-terminal-'));
  try {
    const script = 'scripts/grammar-topics/publish.ts';
    await Bun.write(join(directory, script), Bun.file(new URL('../' + script, import.meta.url)));
    for (const dependency of ['scripts/grammar-pack', 'scripts/content-service', 'src', 'node_modules']) {
      await mkdir(join(directory, dependency, '..'), { recursive: true });
      await symlink(new URL('../' + dependency, import.meta.url).pathname, join(directory, dependency));
    }
    const child = Bun.spawnSync({
      cmd: [process.execPath, '--no-env-file', join(directory, script), '--apply-remote'],
      cwd: directory,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toBe('');
    expect((await readdir(directory)).sort()).toEqual(['node_modules', 'scripts', 'src']);
    expect(await Bun.file(join(directory, '.local/grammar-topics/publish.sql')).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('actual --check CLI validates committed metadata twice without static artifacts or private inputs', () => {
  for (let i = 0; i < 2; i++) {
    const child = Bun.spawnSync(['bun', 'scripts/grammar-topics/publish.ts', '--check'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
    });
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString()).toContain('Topic metadata checked');
  }
});
