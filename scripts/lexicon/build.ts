/** Owns the committed bundle `data/lexicon/lexicon.json`: deterministic generation from Morphalou and a source-free `--check`; not selection, SQL or the Worker. */
import { fileURLToPath } from 'node:url';
import { LexiconBundleSchema, type LexiconBundle } from '../../src/types/lexicon';
import { sourceVersion } from './import';
import { entryRow, loadLexicon, morphalouDir, parseAllowlist, type Lexicon, type Pos } from './lexicon';

const repository = new URL('../../', import.meta.url);

// The source the bundle names; the notice and licence travel next to the data file (data/lexicon/NOTICE.md).
const SOURCE = {
  name: 'Morphalou 3.1',
  maintainer: 'ATILF (CNRS / Université de Lorraine)',
  licence: 'LGPL-LR',
  url: 'http://www.cnrtl.fr/lexiques/morphalou/',
};

/** The LGPL-LR section 2(b) notice: what changed and when, kept inside the distributed data. */
export const CHANGES = 'Selected lemmas and reformatted from Morphalou 3.1; forms unchanged';

const byId = (a: { lemma: string; pos: string }, b: { lemma: string; pos: string }) =>
  `${a.lemma}\0${a.pos}` < `${b.lemma}\0${b.pos}` ? -1 : 1;

/**
 * The bundle exactly as it is committed: entries sorted by lemma then pos, form keys sorted and each key's pairs
 * in the same order (entries are visited in id order), so the same source always gives the same bytes.
 */
export function buildBundle(lexicon: Lexicon, version: string, modified: string): LexiconBundle {
  const sorted = [...lexicon.values()].sort(byId);
  const entries = sorted.map((entry) => {
    const { gender, data } = entryRow(entry);
    return { lemma: entry.lemma, pos: entry.pos, ...(gender !== null && { gender }), data: JSON.parse(data) };
  });
  const pairsByForm = new Map<string, [string, Pos][]>();
  for (const { lemma, pos, forms } of sorted)
    for (const form of forms) {
      const pairs = pairsByForm.get(form);
      if (pairs) pairs.push([lemma, pos]);
      else pairsByForm.set(form, [[lemma, pos]]);
    }
  const forms: Record<string, [string, Pos][]> = {};
  for (const form of [...pairsByForm.keys()].sort()) forms[form] = pairsByForm.get(form)!;
  return LexiconBundleSchema.parse({
    source: { ...SOURCE, sourceVersion: version, changes: CHANGES, modified },
    entries,
    forms,
  });
}

/** Every form string stored in an entry's data, in stored spelling (the form keys are the lowercase of these). */
function dataForms(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(dataForms);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(dataForms);
  return [];
}

/**
 * The source-free check of the committed file: the schema, then every consistency rule that needs no Morphalou
 * source. `allowed` is the committed allowlist's ids; `counts` are the numbers `data/lexicon/README.md` states.
 * A pass proves structure and allowlist agreement, not fidelity to the owner's CSV files.
 */
export function validateBundle(
  raw: unknown,
  expected: { allowed: string[]; counts: { entries: number; forms: number } },
): LexiconBundle {
  const parsed = LexiconBundleSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `data/lexicon/lexicon.json is not a valid bundle:\n${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')}`,
    );
  const bundle = parsed.data;
  const problems: string[] = [];
  const name = (id: string) => id.split('\0').reverse().join(':');
  const ids = new Set(bundle.entries.map(({ lemma, pos }) => `${lemma}\0${pos}`));
  for (const [form, pairs] of Object.entries(bundle.forms))
    for (const [lemma, pos] of pairs)
      if (!ids.has(`${lemma}\0${pos}`))
        problems.push(`form ${form} names an entry that does not exist: ${pos} ${lemma}`);
  for (const entry of bundle.entries)
    for (const form of dataForms(entry.data))
      if (!bundle.forms[form.toLowerCase()]?.some(([lemma, pos]) => lemma === entry.lemma && pos === entry.pos))
        problems.push(`${entry.pos} ${entry.lemma} is missing from its own form ${form}`);
  const allowed = new Set(expected.allowed);
  const unlisted = [...ids].filter((id) => !allowed.has(id));
  const withheld = expected.allowed.filter((id) => !ids.has(id));
  if (unlisted.length || withheld.length)
    problems.push(
      `entries and data/lexicon/lemmas.txt differ: in the bundle, not the allowlist: ${unlisted.map(name).join(', ') || 'none'};` +
        ` allowlisted, not in the bundle: ${withheld.map(name).join(', ') || 'none'}`,
    );
  if (bundle.entries.length !== expected.counts.entries)
    problems.push(
      `bundle has ${bundle.entries.length} entries; data/lexicon/README.md states ${expected.counts.entries}`,
    );
  if (Object.keys(bundle.forms).length !== expected.counts.forms)
    problems.push(
      `bundle has ${Object.keys(bundle.forms).length} forms; data/lexicon/README.md states ${expected.counts.forms}`,
    );
  if (problems.length) throw new Error(problems.join('\n'));
  return bundle;
}

export function parseArgs(args: string[]) {
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: build.ts [--check]');
  return args[0];
}

/** The counts `data/lexicon/README.md` states, so a regenerated bundle without an updated README fails CI. */
function declaredCounts(text: string): { entries: number; forms: number } {
  const counts = /(\d[\d,]*) entries and (\d[\d,]*) forms/.exec(text);
  if (!counts) throw new Error('data/lexicon/README.md does not state "<n> entries and <m> forms"');
  const number = (digits: string) => Number(digits.replaceAll(',', ''));
  return { entries: number(counts[1]), forms: number(counts[2]) };
}

export async function buildLexicon(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  root = repository,
): Promise<void> {
  const mode = parseArgs(args);
  const output = new URL('data/lexicon/lexicon.json', root);
  if (mode === '--check') {
    if (!(await Bun.file(output).exists()))
      throw new Error(
        'no committed data/lexicon/lexicon.json to check against; generate it with MORPHALOU_DIR=<dir> bun scripts/lexicon/build.ts',
      );
    for (const file of ['LGPL-LR.txt', 'NOTICE.md'])
      if (!(await Bun.file(new URL(`data/lexicon/${file}`, root)).exists()))
        throw new Error(`data/lexicon/${file} is missing; it travels with the data file`);
    const bundle = validateBundle(JSON.parse(await Bun.file(output).text()), {
      allowed: parseAllowlist(await Bun.file(new URL('data/lexicon/lemmas.txt', root)).text()),
      counts: declaredCounts(await Bun.file(new URL('data/lexicon/README.md', root)).text()),
    });
    console.log(
      `lexicon.json checked: ${bundle.entries.length} entries, ${Object.keys(bundle.forms).length} forms, ${bundle.source.sourceVersion}`,
    );
    return;
  }
  const dir = morphalouDir(fileURLToPath(root), env);
  const allowed = parseAllowlist(await Bun.file(new URL('data/lexicon/lemmas.txt', root)).text());
  const lexicon = await loadLexicon(dir, new Set(allowed));
  const missing = allowed.filter((id) => !lexicon.has(id));
  if (missing.length)
    throw new Error(
      `Allowlisted but not in Morphalou: ${missing.map((id) => id.split('\0').reverse().join(':')).join(', ')}`,
    );
  const bundle = buildBundle(lexicon, await sourceVersion(dir), new Date().toISOString().slice(0, 10));
  await Bun.write(output, JSON.stringify(bundle) + '\n');
  console.log(
    `data/lexicon/lexicon.json written: ${bundle.entries.length} entries, ${Object.keys(bundle.forms).length} forms, ${bundle.source.sourceVersion}`,
  );
}

if (import.meta.main) {
  try {
    await buildLexicon(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
