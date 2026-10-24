/** Owns private lexicon SQL delivery and read-only D1 verification; not parsing, selection or the Worker. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { d1ExecuteSpawn, requireInteractiveTerminal } from '../content-service/d1Target';
import { entryRow, loadLexicon, morphalouDir, parseAllowlist, SOURCES, type Lexicon, type Pos } from './lexicon';

const repository = new URL('../../', import.meta.url);
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Rows go in multi-row INSERTs of about 50 KB, well inside D1's per-statement size limit (not verified here);
 * wrangler cannot wrap rows in a transaction. Measured in UTF-8 bytes: forms are accented.
 */
export const STATEMENT_CAP = 50_000;

/** `morphalou-3.1+` and the first 8 hex of the SHA-256 of the source files' bytes, so it changes when the source does. */
export async function sourceVersion(dir: string): Promise<string> {
  const hash = createHash('sha256');
  for (const [, file] of SOURCES) for await (const chunk of createReadStream(join(dir, file))) hash.update(chunk);
  return `morphalou-3.1+${hash.digest('hex').slice(0, 8)}`;
}

function* inserts(head: string, tuples: Iterable<string>, cap: number): Generator<string> {
  let body: string[] = [];
  let bytes = head.length + 1;
  for (const tuple of tuples) {
    const size = Buffer.byteLength(tuple) + 2;
    if (body.length && bytes + size > cap) {
      yield `${head}${body.join(',\n')};`;
      body = [];
      bytes = head.length + 1;
    }
    body.push(tuple);
    bytes += size;
  }
  if (body.length) yield `${head}${body.join(',\n')};`;
}

/** The form rows, one per (form, lemma, pos), sorted by form then lemma then pos; the form is the lowercase lookup key. */
export function formRows(lexicon: Lexicon): string[][] {
  return [...lexicon.values()]
    .flatMap(({ lemma, pos, forms }) => [...forms].map((form) => `${form}\0${lemma}\0${pos}`))
    .sort()
    .map((row) => row.split('\0'));
}

/** Replacement SQL in a fixed order: deletes, entries, forms, the version last (wrangler strips explicit transactions). */
export function* lexiconStatements(lexicon: Lexicon, version: string, cap = STATEMENT_CAP): Generator<string> {
  yield "DELETE FROM meta WHERE key = 'lexiconVersion';";
  yield 'DELETE FROM lexicon_forms;';
  yield 'DELETE FROM lexicon_entries;';
  const entries = [...lexicon.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, entry]) => entry);
  yield* inserts(
    'INSERT INTO lexicon_entries (lemma, pos, gender, data) VALUES\n',
    entries.map((entry) => {
      const { gender, data } = entryRow(entry);
      return `(${quote(entry.lemma)}, ${quote(entry.pos)}, ${gender === null ? 'NULL' : quote(gender)}, ${quote(data)})`;
    }),
    cap,
  );
  yield* inserts(
    'INSERT INTO lexicon_forms (form, lemma, pos) VALUES\n',
    formRows(lexicon).map((row) => `(${row.map(quote).join(', ')})`),
    cap,
  );
  yield `INSERT OR REPLACE INTO meta (key, value) VALUES ('lexiconVersion', ${quote(version)});`;
}

export async function checkLexiconPublication(
  root: URL,
  remote: boolean,
  expected: { version: string; entries: number; forms: number },
): Promise<void> {
  const child = Bun.spawn({
    ...d1ExecuteSpawn(
      root,
      remote,
      'd1',
      'execute',
      'DB',
      '--command',
      "SELECT (SELECT value FROM meta WHERE key = 'lexiconVersion') AS version, (SELECT count(*) FROM lexicon_entries) AS entries, (SELECT count(*) FROM lexicon_forms) AS forms;",
      '--json',
    ),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [output, , exitCode] = await Promise.all([
    new Response(child.stdout).json().catch(() => null),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const parsed = z
    .tuple([
      z.object({
        success: z.literal(true),
        results: z.tuple([z.object({ version: z.string().nullable(), entries: z.number(), forms: z.number() })]),
      }),
    ])
    .safeParse(output);
  const row = parsed.success ? parsed.data[0].results[0] : null;
  const versionMatches = row?.version === expected.version;
  if (exitCode === 0 && versionMatches && row?.entries === expected.entries && row.forms === expected.forms) return;
  await Bun.write(
    new URL('.pi-runs/lexicon/check-failure.log', root),
    JSON.stringify({
      exitCode,
      versionMatches,
      expected: { entries: expected.entries, forms: expected.forms },
      actual: row ? { entries: row.entries, forms: row.forms } : null,
    }) + '\n',
  );
  throw new Error('Lexicon import read-only check failed');
}

export function parseArgs(args: string[]) {
  if (args.length && (args.length !== 1 || !['--apply-local', '--apply-remote'].includes(args[0])))
    throw new Error('Usage: import.ts [--apply-local | --apply-remote]');
  return args[0];
}

export async function importLexicon(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  root = repository,
  { allowRemote = false }: { allowRemote?: boolean } = {},
): Promise<void> {
  let mode: string | undefined;
  try {
    mode = parseArgs(args);
    if (mode === '--apply-remote') {
      if (allowRemote !== true) throw new Error('Remote publication requires owner CLI authorization');
      requireInteractiveTerminal(Boolean(process.stdin.isTTY), Boolean(process.stdout.isTTY));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
  const remote = mode === '--apply-remote';
  try {
    const started = performance.now();
    const dir = morphalouDir(fileURLToPath(root), env);
    const allowed = parseAllowlist(await Bun.file(new URL('data/lexicon/lemmas.txt', root)).text());
    const lexicon = await loadLexicon(dir, new Set(allowed));
    const missing = allowed.filter((id) => !lexicon.has(id));
    if (missing.length)
      throw new Error(
        `Allowlisted but not in Morphalou: ${missing.map((id) => id.split('\0').reverse().join(':')).join(', ')}`,
      );

    const version = await sourceVersion(dir);
    const rows = formRows(lexicon);
    const output = new URL('.local/lexicon/import.sql', root);
    await mkdir(fileURLToPath(new URL('.local/lexicon/', root)), { recursive: true });
    const writer = Bun.file(output).writer();
    let bytes = 0;
    for (const statement of lexiconStatements(lexicon, version)) {
      await writer.write(statement + '\n');
      bytes += Buffer.byteLength(statement) + 1;
    }
    await writer.end();

    if (mode === '--apply-local' || remote) {
      const child = Bun.spawn({
        ...d1ExecuteSpawn(root, remote, 'd1', 'execute', 'DB', '--file', fileURLToPath(output)),
        stdin: remote ? 'inherit' : 'ignore',
        stdout: remote ? 'inherit' : 'pipe',
        stderr: remote ? 'inherit' : 'pipe',
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      // The import exit code cannot distinguish a remote confirmation from a declined prompt.
      if (!remote && exitCode !== 0) throw new Error(`Local D1 import failed (${exitCode})\n${stdout}${stderr}`);
      await checkLexiconPublication(root, remote, { version, entries: lexicon.size, forms: rows.length });
    }
    for (const pos of ['verb', 'noun', 'adjective'] as Pos[]) {
      const lemmas = allowed.filter((id) => id.endsWith(`\0${pos}`)).length;
      console.log(`${pos}: ${lemmas} lemmas, ${rows.filter((row) => row[2] === pos).length} form rows`);
    }
    console.log(`${allowed.length} lemmas, ${rows.length} form rows, ${bytes} SQL bytes: ${fileURLToPath(output)}`);
    console.log(`${((performance.now() - started) / 1000).toFixed(1)} seconds`);
    if (mode === '--apply-local' || remote) console.log(`Lexicon imported ${remote ? 'remotely' : 'locally'}`);
  } catch (error) {
    await Bun.write(new URL('.pi-runs/lexicon/failure.log', root), Bun.inspect(error) + '\n');
    console.error('Lexicon import failed; private diagnostics in .pi-runs/lexicon/failure.log');
    throw error;
  }
}

if (import.meta.main) {
  try {
    await importLexicon(Bun.argv.slice(2), process.env, repository, { allowRemote: true });
  } catch {
    process.exitCode = 1;
  }
}
