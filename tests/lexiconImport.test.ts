/** Owns the lexicon importer's SQL and remote-apply checks on an invented CSV; the parser, selection and bundle checks live in lexiconBuild.test.ts. */
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, readdir, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importLexicon, lexiconStatements, parseArgs, STATEMENT_CAP } from '../scripts/lexicon/import';
import { entryRow, loadLexicon, parseAllowlist, type Lexicon } from '../scripts/lexicon/lexicon';
import { ALLOWLIST, writeMorphalouFixture } from './fixtures/morphalouCsv';
import { createWorkerDb } from './fixtures/workerDb';

/** The message a promise rejects with, or `resolved`. */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: Error) => error.message,
  );

let root: string;
let dir: string;
let lexicon: Lexicon;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'relire-lexicon-'));
  dir = join(root, 'csv');
  await writeMorphalouFixture(dir);
  lexicon = await loadLexicon(dir, new Set(parseAllowlist(ALLOWLIST)));
});
afterAll(() => rm(root, { recursive: true, force: true }));

/** Applies the statements to SQLite built from the real migrations. */
async function load(data: Lexicon, cap?: number) {
  const { db } = await createWorkerDb();
  const statements = [...lexiconStatements(data, 'morphalou-3.1+test0000', cap)];
  for (const statement of statements) db.exec(statement);
  return { db, statements };
}

describe('SQL', () => {
  test('rows equal the model, forms are deduplicated lowercase keys, the version is last', async () => {
    const { db, statements } = await load(lexicon);
    expect(statements[0]).toBe("DELETE FROM meta WHERE key = 'lexiconVersion';");
    expect(statements[1]).toBe('DELETE FROM lexicon_forms;');
    expect(statements[2]).toBe('DELETE FROM lexicon_entries;');
    expect(statements.at(-1)).toContain("'lexiconVersion', 'morphalou-3.1+test0000'");
    expect(db.query("SELECT value FROM meta WHERE key = 'lexiconVersion'").get()).toEqual({
      value: 'morphalou-3.1+test0000',
    });
    const entries = db.query('SELECT lemma, pos, gender, data FROM lexicon_entries ORDER BY lemma, pos').all() as {
      lemma: string;
      pos: string;
      gender: string | null;
      data: string;
    }[];
    expect(entries.length).toBe(lexicon.size);
    for (const row of entries) {
      expect({ gender: row.gender, data: row.data }).toEqual(entryRow(lexicon.get(`${row.lemma}\0${row.pos}`)!));
    }
    const forms = db.query('SELECT form, lemma, pos FROM lexicon_forms').all() as {
      form: string;
      lemma: string;
      pos: string;
    }[];
    expect(forms.length).toBe(new Set(forms.map((row) => `${row.form}\0${row.lemma}\0${row.pos}`)).size);
    expect(forms.every((row) => row.form === row.form.toLowerCase())).toBe(true);
    expect(forms.filter((row) => row.form === 'testmarche').map((row) => row.lemma)).toEqual(['testmarcher']);
    // One form of several lemmas keeps one row per lemma.
    expect(forms.filter((row) => row.form === 'testinvar')).toEqual([
      { form: 'testinvar', lemma: 'testinvar', pos: 'noun' },
    ]);
  });

  test('every statement stays under the cap in UTF-8 bytes, and a small cap splits the inserts', async () => {
    for (const cap of [STATEMENT_CAP, 700]) {
      const { statements, db } = await load(lexicon, cap);
      for (const statement of statements.filter((s) => s.startsWith('INSERT INTO'))) {
        expect(Buffer.byteLength(statement)).toBeLessThanOrEqual(cap);
      }
      expect((db.query('SELECT COUNT(*) AS n FROM lexicon_entries').get() as { n: number }).n).toBe(lexicon.size);
    }
    const { statements } = await load(lexicon, 700);
    expect(statements.filter((s) => s.startsWith('INSERT INTO lexicon_forms')).length).toBeGreaterThan(1);
    // The fixture has multi-byte characters, so bytes and characters differ.
    expect(statements.some((s) => Buffer.byteLength(s) > s.length)).toBe(true);
  });

  test('a replacement load leaves no stale rows', async () => {
    const { db, statements } = await load(lexicon);
    const smaller: Lexicon = new Map([...lexicon].slice(0, 2));
    for (const statement of lexiconStatements(smaller, 'morphalou-3.1+test0001')) db.exec(statement);
    expect((db.query('SELECT COUNT(*) AS n FROM lexicon_entries').get() as { n: number }).n).toBe(2);
    expect(statements.length).toBeGreaterThan(3);
    expect(
      (
        db
          .query('SELECT COUNT(*) AS n FROM lexicon_forms WHERE lemma NOT IN (SELECT lemma FROM lexicon_entries)')
          .get() as { n: number }
      ).n,
    ).toBe(0);
  });
});

test('pure argument parsing accepts SQL preparation and explicit apply modes only', () => {
  for (const args of [[], ['--apply-local'], ['--apply-remote']]) expect(parseArgs(args)).toBe(args[0]);
  for (const args of [
    ['--remote'],
    ['--unknown'],
    ['--check'],
    ['--apply-remote', '--remote'],
    ['--apply-remote', '--apply-local'],
    ['--apply-remote', '--check'],
    ['--apply-remote', '--apply-remote'],
    ['--apply-local', '--apply-local'],
  ])
    expect(() => parseArgs(args)).toThrow('Usage');
});

test.each([
  { args: ['--bogus'], allowRemote: true, message: 'Usage: import.ts [--apply-local | --apply-remote]' },
  ...[undefined, false].map((allowRemote) => ({
    args: ['--apply-remote'],
    allowRemote,
    message: 'Remote publication requires owner CLI authorization',
  })),
  { args: ['--apply-remote'], allowRemote: true, message: 'Remote publication requires TTY stdin and stdout' },
])('early refusal prints $message exactly once without creating files', async ({ args, allowRemote, message }) => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-lexicon-failure-'));
  const log = spyOn(console, 'log').mockImplementation(() => {});
  const error = spyOn(console, 'error').mockImplementation(() => {});
  const stdinIsTTY = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    expect(await rejection(importLexicon([...args], {}, pathToFileURL(directory + '/'), { allowRemote }))).toBe(
      message,
    );
    expect(await readdir(directory)).toEqual([]);
    expect(log.mock.calls).toEqual([]);
    expect(error.mock.calls).toEqual([[message]]);
  } finally {
    process.stdin.isTTY = stdinIsTTY;
    log.mockRestore();
    error.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remote CLI refuses non-TTY streams before inputs, output, logs or Wrangler access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-lexicon-terminal-'));
  try {
    const script = 'scripts/lexicon/import.ts';
    await Bun.write(join(directory, script), Bun.file(new URL('../' + script, import.meta.url)));
    for (const dependency of ['scripts/lexicon/lexicon.ts', 'scripts/content-service', 'node_modules']) {
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
    expect(child.stderr.toString()).toBe('Remote publication requires TTY stdin and stdout\n');
    expect((await readdir(directory)).sort()).toEqual(['node_modules', 'scripts']);
    expect(await Bun.file(join(directory, '.local/lexicon/import.sql')).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
