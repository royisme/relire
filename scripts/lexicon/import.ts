/** Owns private lexicon SQL delivery to local D1 from the local Morphalou copy and the committed allowlist; not parsing, selection or the Worker. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryRow, loadLexicon, morphalouDir, parseAllowlist, SOURCES, type Lexicon, type Pos } from './lexicon';

const repository = new URL('../../', import.meta.url);
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * D1 refuses a statement over 100 KB and wrangler cannot wrap rows in a transaction, so rows go in
 * statements well under that, each a multi-row INSERT. Measured in UTF-8 bytes: forms are accented.
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

export async function importLexicon(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  root = repository,
): Promise<void> {
  if (args.length && (args.length !== 1 || args[0] !== '--apply-local'))
    throw new Error('Usage: import.ts [--apply-local]');
  const started = performance.now();
  const dir = morphalouDir(fileURLToPath(root), env);
  const allowed = parseAllowlist(await Bun.file(new URL('data/lexicon/lemmas.txt', root)).text());
  const lexicon = await loadLexicon(dir, new Set(allowed));
  const missing = allowed.filter((id) => !lexicon.has(id));
  if (missing.length)
    throw new Error(
      `Allowlisted but not in Morphalou: ${missing.map((id) => id.split('\0').reverse().join(':')).join(', ')}`,
    );

  const output = new URL('.local/lexicon/import.sql', root);
  await mkdir(fileURLToPath(new URL('.local/lexicon/', root)), { recursive: true });
  const writer = Bun.file(output).writer();
  let bytes = 0;
  for (const statement of lexiconStatements(lexicon, await sourceVersion(dir))) {
    await writer.write(statement + '\n');
    bytes += Buffer.byteLength(statement) + 1;
  }
  await writer.end();

  const rows = formRows(lexicon);
  for (const pos of ['verb', 'noun', 'adjective'] as Pos[]) {
    const lemmas = allowed.filter((id) => id.endsWith(`\0${pos}`)).length;
    console.log(`${pos}: ${lemmas} lemmas, ${rows.filter((row) => row[2] === pos).length} form rows`);
  }
  console.log(`${allowed.length} lemmas, ${rows.length} form rows, ${bytes} SQL bytes: ${fileURLToPath(output)}`);
  console.log(`${((performance.now() - started) / 1000).toFixed(1)} seconds`);
  if (args[0] === '--apply-local') {
    const child = Bun.spawn(['bunx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--file', fileURLToPath(output)], {
      cwd: fileURLToPath(new URL('worker/', root)),
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if ((await child.exited) !== 0)
      throw new Error(
        'Local D1 import failed. If the schema is missing: cd worker && bunx wrangler d1 migrations apply DB --local',
      );
    console.log('Lexicon imported locally');
  }
}

if (import.meta.main) {
  try {
    await importLexicon(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
