/** Owns exact target arguments and real local D1 publication with disposable TEST inputs; remote branches are never executed. */
import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { d1ExecuteSpawn, platformProxyOptions } from '../scripts/content-service/d1Target';
import { buildPublishSql, publish } from '../scripts/grammar-topics/publish';
import { topicContentHash } from '../scripts/grammar-pack/gate';
import { formRows, importLexicon, lexiconStatements, sourceVersion } from '../scripts/lexicon/import';
import { loadLexicon, parseAllowlist } from '../scripts/lexicon/lexicon';
import { vocabularyMetadata } from '../src/services/vocabulary/book';
import { handle, type Env } from '../worker/src/index';
import { topicFixture } from './fixtures/grammarTopics';
import { ALLOWLIST, writeMorphalouFixture } from './fixtures/morphalouCsv';
import { testBook } from './fixtures/vocabulary';

async function createLocalD1Root() {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-local-d1-'));
  const root = pathToFileURL(directory + '/');
  await mkdir(join(directory, 'worker/migrations'), { recursive: true });
  await copyFile(new URL('../worker/wrangler.jsonc', import.meta.url), new URL('worker/wrangler.jsonc', root));
  for (const migration of ['0001_init.sql', '0002_lexicon.sql', '0003_vocabulary.sql', '0004_readers.sql'])
    await copyFile(
      new URL(`../worker/migrations/${migration}`, import.meta.url),
      new URL(`worker/migrations/${migration}`, root),
    );
  await symlink(
    resolve(await realpath(new URL('../node_modules', import.meta.url)), '../worker/node_modules'),
    join(directory, 'worker/node_modules'),
  );
  const child = Bun.spawnSync({ ...d1ExecuteSpawn(root, false, 'd1', 'migrations', 'apply', 'DB'), stdin: 'ignore' });
  expect(child.stderr.toString()).toBe('');
  expect(child.exitCode).toBe(0);
  return { directory, root };
}

let directory: string;
let root: URL;
beforeAll(async () => {
  ({ directory, root } = await createLocalD1Root());
}, 30_000);
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('local spawn arguments pin Node, config, state, env-file and telemetry beneath root', async () => {
  const spawn = d1ExecuteSpawn(root, false, 'd1', 'execute', 'DB', '--command', 'SELECT 1');
  expect(spawn.cmd).toEqual([
    'node',
    '--no-warnings',
    '--',
    join(directory, 'worker/node_modules/wrangler/wrangler-dist/cli.js'),
    'd1',
    'execute',
    'DB',
    '--command',
    'SELECT 1',
    '--local',
    '--config',
    join(directory, 'worker/wrangler.jsonc'),
    '--persist-to',
    join(directory, 'worker/.wrangler/state'),
    '--env-file',
    '.no-env-files',
  ]);
  expect(spawn.cwd).toBe(join(directory, 'worker'));
  expect(spawn.env.WRANGLER_SEND_METRICS).toBe('false');
  expect(spawn.env.WRANGLER_HIDE_BANNER).toBe('true');
  expect(await Bun.file(spawn.cmd[3]).exists()).toBe(true);
  expect(await Bun.file(join(directory, 'worker/wrangler.jsonc')).exists()).toBe(true);
  expect(await Bun.file(join(directory, 'worker/.no-env-files')).exists()).toBe(false);
  expect(platformProxyOptions(root, false)).toEqual({
    configPath: join(directory, 'worker/wrangler.jsonc'),
    remoteBindings: false,
    persist: { path: join(directory, 'worker/.wrangler/state/v3') },
    envFiles: ['.no-env-files'],
  });
  expect(platformProxyOptions(directory, false)).toEqual(platformProxyOptions(root, false));
  expect(d1ExecuteSpawn(directory, false).cmd).toEqual(d1ExecuteSpawn(root, false).cmd);
});

test('remote branch arguments/options are exact assertions only, without spawning or starting a proxy', () => {
  const spawn = d1ExecuteSpawn(root, true, 'd1', 'execute', 'DB', '--file', join(directory, 'TEST.sql'));
  expect(spawn.cmd).toEqual([
    'node',
    '--no-warnings',
    '--',
    join(directory, 'worker/node_modules/wrangler/wrangler-dist/cli.js'),
    'd1',
    'execute',
    'DB',
    '--file',
    join(directory, 'TEST.sql'),
    '--remote',
    '--config',
    join(directory, 'worker/wrangler.deploy.jsonc'),
    '--env-file',
    '.no-env-files',
  ]);
  expect(spawn.cwd).toBe(join(directory, 'worker'));
  expect(spawn.env.WRANGLER_SEND_METRICS).toBe('false');
  expect(spawn.env.WRANGLER_HIDE_BANNER).toBe('true');
  expect(platformProxyOptions(root, true)).toEqual({
    configPath: join(directory, 'worker/wrangler.deploy.jsonc'),
    remoteBindings: true,
    persist: false,
    envFiles: ['.no-env-files'],
  });
});

test.each([
  {
    script: 'scripts/vocabulary/publish.ts',
    rootModule: 'scripts/vocabulary/metadata.ts',
    dependencies: ['scripts/vocabulary/publication.ts', 'scripts/content-service', 'src'],
    flag: '--apply-remote-unreviewed',
    log: '.pi-runs/vocabulary/failure.log',
    message: 'Vocabulary publication failed; private diagnostics in .pi-runs/vocabulary/failure.log',
  },
  {
    script: 'scripts/graded-readers/publishRemote.ts',
    rootModule: 'scripts/grammar-topics/reference.ts',
    dependencies: [
      'scripts/graded-readers/assemble.ts',
      'scripts/graded-readers/reviewInputs.ts',
      'scripts/graded-readers/publication.ts',
      'scripts/content-service',
    ],
    flag: '--apply-remote',
    log: '.pi-runs/graded-readers/publish-failure.log',
    message: 'Reader publication failed; private diagnostics in .pi-runs/graded-readers/publish-failure.log',
  },
])('$script CLI refuses non-TTY stdin and stdout before metadata or Wrangler', async (publisher) => {
  expect(process.stdin.isTTY).toBeFalsy();
  expect(process.stdout.isTTY).toBeFalsy();
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-cli-refusal-'));
  try {
    // Copy the entrypoint and its root constant; other imports stay on the real implementation.
    for (const file of [publisher.script, publisher.rootModule]) {
      await Bun.write(join(directory, file), Bun.file(new URL('../' + file, import.meta.url)));
    }
    for (const file of publisher.dependencies) {
      await mkdir(resolve(directory, file, '..'), { recursive: true });
      await symlink(new URL('../' + file, import.meta.url).pathname, join(directory, file));
    }
    const child = Bun.spawnSync({
      cmd: [process.execPath, '--no-env-file', join(directory, publisher.script), publisher.flag],
      cwd: directory,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toBe(publisher.message + '\n');
    expect(await Bun.file(join(directory, publisher.log)).text()).toContain(
      'Remote publication requires TTY stdin and stdout',
    );
    expect(await Bun.file(join(directory, '.local/vocabulary/publish.sql')).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function writePublicationInputs(directory: string) {
  const root = pathToFileURL(directory + '/');
  const topic = topicFixture();
  const input = {
    manifest: {
      packVersion: '0.1.0',
      topics: [
        {
          id: topic.id,
          level: topic.level,
          chapter: topic.chapter,
          tags: topic.tags,
          related: topic.related,
          reference: topic.provenance.reference,
          include: true,
        },
      ],
    },
    drafts: [topic],
    reviews: {
      records: [
        { topicId: topic.id, contentHash: topicContentHash(topic), reviewedBy: 'TEST ONLY', reviewedAt: '2026-10-18' },
      ],
    },
  };
  await Bun.write(new URL('data/grammar-topics/manifest.json', root), JSON.stringify(input.manifest));
  await Bun.write(new URL('data/grammar-topics/reviews.json', root), JSON.stringify(input.reviews));
  await Bun.write(new URL(`.local/grammar-topics/drafts-${topic.chapter}.json`, root), JSON.stringify(input.drafts));
  const csv = join(directory, 'csv');
  await writeMorphalouFixture(csv);
  await Bun.write(new URL('data/lexicon/lemmas.txt', root), ALLOWLIST);
  return { input, csv };
}

test('topics and lexicon apply through real CLI and share the explicit proxy state; deleting each version makes the Worker unavailable', async () => {
  const { input, csv } = await writePublicationInputs(directory);
  await publish(['--apply-local'], root);
  await importLexicon(['--apply-local'], { MORPHALOU_DIR: csv }, root);
  const lexicon = await loadLexicon(csv, new Set(parseAllowlist(ALLOWLIST)));
  const { getPlatformProxy } = await import(new URL('worker/node_modules/wrangler/wrangler-dist/cli.js', root).href);
  const proxy: { env: Pick<Env, 'DB'>; dispose(): Promise<void> } = await getPlatformProxy(
    platformProxyOptions(root, false),
  );
  try {
    const db = proxy.env.DB;
    expect(await db.prepare("SELECT value FROM meta WHERE key = 'packVersion'").first('value')).toBe(
      buildPublishSql(input).version,
    );
    expect(await db.prepare('SELECT body FROM topics').first('body')).toBe(
      JSON.stringify(buildPublishSql(input).pack.topics[0]),
    );
    expect(await db.prepare("SELECT value FROM meta WHERE key = 'lexiconVersion'").first('value')).toBe(
      await sourceVersion(csv),
    );
    expect(await db.prepare('SELECT COUNT(*) AS n FROM lexicon_entries').first('n')).toBe(lexicon.size);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM lexicon_forms').first('n')).toBe(formRows(lexicon).length);
    await db.prepare(buildPublishSql(input).sql.split('\n')[0]).run();
    await db.prepare([...lexiconStatements(lexicon, 'TEST')][0]).run();
    for (const path of ['/v1/topics', '/v1/lexicon/form/testmarche']) {
      const response = await handle(new Request('https://content.test' + path), { DB: db, ALLOWED_ORIGINS: '' });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'unavailable' });
    }
  } finally {
    await proxy.dispose();
  }
}, 30_000);

test('real CLI failures stay in rooted private logs, never inherited stdout/stderr', async () => {
  const { directory, root } = await createLocalD1Root();
  const log = spyOn(console, 'log').mockImplementation(() => {});
  const error = spyOn(console, 'error').mockImplementation(() => {});
  try {
    await writePublicationInputs(directory);
    const { getPlatformProxy } = await import(new URL('worker/node_modules/wrangler/wrangler-dist/cli.js', root).href);
    const proxy: { env: Pick<Env, 'DB'>; dispose(): Promise<void> } = await getPlatformProxy(
      platformProxyOptions(root, false),
    );
    try {
      await proxy.env.DB.prepare('DROP TABLE topics').run();
      await proxy.env.DB.prepare('DROP TABLE lexicon_entries').run();
    } finally {
      await proxy.dispose();
    }
    expect(
      await publish(['--apply-local'], root).then(
        () => 'resolved',
        (error: Error) => error.message,
      ),
    ).toContain('Local D1 publish failed');
    expect(
      await importLexicon(['--apply-local'], { MORPHALOU_DIR: join(directory, 'csv') }, root).then(
        () => 'resolved',
        (error: Error) => error.message,
      ),
    ).toContain('Local D1 import failed');
    expect(await Bun.file(new URL('.pi-runs/grammar-topics/failure.log', root)).text()).toContain(
      'no such table: topics',
    );
    expect(await Bun.file(new URL('.pi-runs/lexicon/failure.log', root)).text()).toContain(
      'no such table: lexicon_entries',
    );
    expect(log.mock.calls).toEqual([]);
    expect(error.mock.calls).toEqual([
      ['Topic publication failed; private diagnostics in .pi-runs/grammar-topics/failure.log'],
      ['Lexicon import failed; private diagnostics in .pi-runs/lexicon/failure.log'],
    ]);
  } finally {
    log.mockRestore();
    error.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test('vocabulary uses the rooted real proxy, bound pages, markers and verified pointer', async () => {
  const { publish } = await import('../scripts/vocabulary/publish');
  const book = await testBook();
  const metadata = vocabularyMetadata(book.manifest);
  const contentHash = book.manifest.review.contentHash;
  await Bun.write(new URL('data/vocabulary/manifest.json', root), JSON.stringify({ ...metadata, contentHash }));
  await Bun.write(new URL('data/vocabulary/reviews.json', root), JSON.stringify({ records: [book.manifest.review] }));
  await Bun.write(
    new URL('.local/vocabulary/normalized.json', root),
    JSON.stringify({ metadata, entries: book.entries, contentHash }),
  );
  await publish(['--apply-local'], root);
  await publish(['--apply-local'], root);
  const { getPlatformProxy } = await import(new URL('worker/node_modules/wrangler/wrangler-dist/cli.js', root).href);
  const proxy: { env: Pick<Env, 'DB'>; dispose(): Promise<void> } = await getPlatformProxy(
    platformProxyOptions(root, false),
  );
  try {
    expect(
      await proxy.env.DB.prepare("SELECT value FROM meta WHERE key = 'vocabularyCurrent:tcf-7000'").first('value'),
    ).toBe(book.manifest.version);
    const body = await proxy.env.DB.prepare('SELECT body FROM vocabulary_pages').first<string>('body');
    expect(JSON.parse(body!).entries).toEqual(book.entries);
  } finally {
    await proxy.dispose();
  }
  expect(await Bun.file(new URL('.pi-runs/vocabulary/command-1.log', root)).exists()).toBe(true);
  expect(await Bun.file(new URL('.pi-runs/vocabulary/failure.log', root)).exists()).toBe(false);
}, 30_000);
