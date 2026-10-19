/**
 * Owns the machine-checkable shape of the code, so no agent has to remember it: a source file stays within the
 * context window (at most 500 lines), a line stays readable (at most 200 characters), and a file name says what the
 * file is for (no catch-all names such as `utils` or `types`). Old violations sit in a ledger that may only shrink:
 * an entry that grew fails, and an entry that shrank must be lowered (`--tighten` does it). Does not own style
 * (the formatter and linter) or the judgement calls in the rule files.
 */
import { basename } from 'node:path';

export const MAX_FILE_LINES = 500;
export const MAX_LINE_CHARS = 200;
/** Catch-all names: a project ends up with ten of them and nobody can tell which one to change. */
export const GENERIC_NAMES = ['utils', 'util', 'types', 'config', 'helpers', 'common', 'misc', 'shared', 'constants'];

export interface Ledger {
  /** Path to the line count it may not exceed. */
  longFiles: Record<string, number>;
  /** Path to the number of lines over the width limit it may not exceed. */
  longLines: Record<string, number>;
  /** Paths whose catch-all name is tolerated until they are renamed. */
  genericNames: string[];
}

export interface SourceFile {
  path: string;
  text: string;
}

const stem = (path: string) => basename(path).replace(/\.[^.]+$/, '');

/** What a file measures: its line count (a trailing newline is not a line) and its lines over the width limit. */
export function measure(text: string) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return { lines: lines.length, longLines: lines.filter((line) => line.length > MAX_LINE_CHARS).length };
}

export interface Problems {
  /** Violations nobody has recorded: fix the code. */
  violations: string[];
  /** Ledger entries that are now too high or no longer needed: lower them. */
  stale: string[];
}

export function checkShape(files: SourceFile[], ledger: Ledger): Problems {
  const violations: string[] = [];
  const stale: string[] = [];
  const seen = new Set(files.map(({ path }) => path));
  for (const { path, text } of files) {
    const { lines, longLines } = measure(text);
    const allowedLines = ledger.longFiles[path] ?? MAX_FILE_LINES;
    if (lines > allowedLines) {
      violations.push(
        `${path}: ${lines} lines; the limit is ${allowedLines}${path in ledger.longFiles ? ' (its ledger entry)' : ''}`,
      );
    } else if (path in ledger.longFiles && lines <= MAX_FILE_LINES) {
      stale.push(`${path}: now ${lines} lines, within ${MAX_FILE_LINES}; remove its longFiles entry`);
    } else if (path in ledger.longFiles && lines < ledger.longFiles[path]!) {
      stale.push(`${path}: now ${lines} lines; lower its longFiles entry from ${ledger.longFiles[path]}`);
    }
    const allowedLong = ledger.longLines[path] ?? 0;
    if (longLines > allowedLong) {
      violations.push(
        `${path}: ${longLines} lines over ${MAX_LINE_CHARS} characters; ${allowedLong} allowed${path in ledger.longLines ? ' (its ledger entry)' : ''}`,
      );
    } else if (path in ledger.longLines && longLines < allowedLong) {
      stale.push(
        longLines === 0
          ? `${path}: no line over ${MAX_LINE_CHARS} characters any more; remove its longLines entry`
          : `${path}: now ${longLines} lines over ${MAX_LINE_CHARS}; lower its longLines entry from ${allowedLong}`,
      );
    }
    if (GENERIC_NAMES.includes(stem(path).toLowerCase()) && !ledger.genericNames.includes(path)) {
      violations.push(`${path}: a catch-all file name; name the file for what it holds (order_utils, not utils)`);
    }
  }
  for (const path of [...Object.keys(ledger.longFiles), ...Object.keys(ledger.longLines), ...ledger.genericNames]) {
    if (!seen.has(path)) stale.push(`${path}: in the ledger but not a source file any more; remove its entries`);
  }
  return { violations, stale: [...new Set(stale)] };
}

/** The ledger lowered to what the files measure now. It never raises an entry and never adds one. */
export function tighten(files: SourceFile[], ledger: Ledger): Ledger {
  const byPath = new Map(files.map((file) => [file.path, measure(file.text)]));
  const next: Ledger = { longFiles: {}, longLines: {}, genericNames: [] };
  for (const [path, allowed] of Object.entries(ledger.longFiles)) {
    const now = byPath.get(path)?.lines;
    if (now !== undefined && now > MAX_FILE_LINES) next.longFiles[path] = Math.min(allowed, now);
  }
  for (const [path, allowed] of Object.entries(ledger.longLines)) {
    const now = byPath.get(path)?.longLines;
    if (now) next.longLines[path] = Math.min(allowed, now);
  }
  next.genericNames = ledger.genericNames.filter((path) => byPath.has(path));
  return next;
}

const SOURCE = /\.(ts|tsx|js|mjs)$/;
const root = new URL('../', import.meta.url);

async function trackedSources(): Promise<SourceFile[]> {
  const listed = Bun.spawnSync({ cmd: ['git', 'ls-files', '-z'], cwd: root.pathname });
  const paths = new TextDecoder()
    .decode(listed.stdout)
    .split('\0')
    .filter((path) => SOURCE.test(path));
  return Promise.all(paths.map(async (path) => ({ path, text: await Bun.file(new URL(path, root)).text() })));
}

if (import.meta.main) {
  const ledgerUrl = new URL('scripts/code-shape-ledger.json', root);
  const ledger = (await Bun.file(ledgerUrl).json()) as Ledger;
  const files = await trackedSources();
  if (Bun.argv.includes('--tighten')) {
    await Bun.write(ledgerUrl, JSON.stringify(tighten(files, ledger), null, 2) + '\n');
    console.log('Ledger lowered to what the files measure now.');
  } else {
    const { violations, stale } = checkShape(files, ledger);
    for (const line of [
      ...violations,
      ...stale.map((entry) => `${entry} (run: bun scripts/check-code-shape.ts --tighten)`),
    ])
      console.error(line);
    if (violations.length || stale.length) process.exit(1);
    console.log(`Code shape OK: ${files.length} source files`);
  }
}
