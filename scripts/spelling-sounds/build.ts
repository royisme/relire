/** Owns spelling-sound gates, hash-bound assembly and deterministic build/check CLI; not review recording or loading. */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SpellingSoundsSourceSchema,
  SpellingSoundsReviewsSchema,
  SpellingSoundsPackSchema,
  type SpellingSoundPattern,
  type SpellingSoundsSource,
  type SpellingSoundsReviews,
} from '../../src/types/spellingSounds';

export interface PatternNotes {
  en: Record<string, string>;
  zh: Record<string, string>;
}
export interface BuildInputs {
  source: SpellingSoundsSource;
  reviews: SpellingSoundsReviews;
  notes: PatternNotes;
}
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function checkPatterns(patterns: SpellingSoundPattern[], notes: PatternNotes): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const words = new Set<string>();
  for (const row of patterns) {
    if (ids.has(row.id)) problems.push(`${row.id}: duplicate pattern id`);
    ids.add(row.id);
    for (const language of ['en', 'zh'] as const) {
      if (!notes[language][row.id]?.trim())
        problems.push(`${language}: missing or blank spellingSounds.notes.${row.id}`);
    }
    for (const word of row.examples) {
      const label = `${row.id}: ${word}`;
      if (words.has(word)) problems.push(`${label}: duplicate example across the pack`);
      words.add(word);
      if (!word.includes(row.spelling)) problems.push(`${label}: must contain spelling ${row.spelling}`);
      if (row.group === 'silent' && !word.startsWith(row.spelling))
        problems.push(`${label}: silent spelling must start the word`);
      for (const other of patterns) {
        if (
          other.id !== row.id &&
          other.group !== 'silent' &&
          JSON.stringify(other.sound) !== JSON.stringify(row.sound) &&
          word.includes(other.spelling)
        ) {
          problems.push(`${label}: contains different-sound spelling ${other.spelling} (${other.id})`);
        }
      }
      // Check every occurrence, including overlapping ones, not only the first match.
      for (let at = word.indexOf(row.spelling); at !== -1; at = word.indexOf(row.spelling, at + 1)) {
        const next = word.slice(at + row.spelling.length).match(/^./u)?.[0];
        if (row.group === 'nasals' && next !== undefined && !/^[bcçdfghjklpqrstvwxz]$/u.test(next)) {
          problems.push(`${label}: nasal spelling must end the word or precede a consonant other than n or m`);
        }
        if (row.spelling === 'oi' && next === 'n') problems.push(`${label}: oi must not be followed by n`);
      }
    }
  }
  return problems;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

/** Both locale notes belong to the reviewed content, even though they ship separately. */
export function rowHash(row: SpellingSoundPattern, notes: PatternNotes): string {
  return digest({ row, en: notes.en[row.id], zh: notes.zh[row.id] });
}

export function buildPack({ source: rawSource, reviews: rawReviews, notes }: BuildInputs) {
  const source = SpellingSoundsSourceSchema.parse(rawSource);
  const reviews = SpellingSoundsReviewsSchema.parse(rawReviews);
  const failures = checkPatterns(source.patterns, notes);
  const patterns = source.patterns.map((row) => {
    const latest = [...reviews.records].reverse().find((record) => record.id === row.id);
    if (!latest) failures.push(`${row.id}: build refuses pattern with no matching review`);
    else if (latest.rowHash !== rowHash(row, notes))
      failures.push(`${row.id}: review lapsed (row or locale note changed)`);
    return { ...row, review: latest && { kind: latest.kind, by: latest.reviewedBy, at: latest.reviewedAt } };
  });
  if (failures.length) throw new Error(failures.join('\n'));
  // Content-addressed version includes notes and review metadata; builds never read the clock.
  const packVersion = digest({ patterns, hashes: source.patterns.map((row) => rowHash(row, notes)) });
  return SpellingSoundsPackSchema.parse({ schemaVersion: 1, packVersion, patterns });
}

export async function readInputs(root = repositoryRoot, notes?: PatternNotes): Promise<BuildInputs> {
  const [source, reviews] = await Promise.all([
    Bun.file(join(root, 'data/spelling-sounds/patterns.json')).json(),
    Bun.file(join(root, 'data/spelling-sounds/reviews.json')).json(),
  ]);
  if (!notes) {
    const [en, zh] = await Promise.all(
      ['en', 'zh'].map(async (language) => {
        const locale = await Bun.file(join(root, `src/i18n/locales/${language}.json`)).json();
        return (locale.spellingSounds?.notes ?? {}) as Record<string, string>;
      }),
    );
    notes = { en, zh };
  }
  return {
    source: SpellingSoundsSourceSchema.parse(source),
    reviews: SpellingSoundsReviewsSchema.parse(reviews),
    notes,
  };
}

export async function build(args: string[], root = repositoryRoot, notes?: PatternNotes): Promise<void> {
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: build.ts [--check]');
  const pack = buildPack(await readInputs(root, notes));
  const bytes = JSON.stringify(pack, null, 2) + '\n';
  const output = Bun.file(join(root, 'src/data/spelling-sounds/patterns.json'));
  if (args[0] === '--check') {
    if (!(await output.exists()))
      throw new Error('no committed src/data/spelling-sounds/patterns.json to check against');
    if ((await output.text()) !== bytes) throw new Error('patterns.json differs from the generated pack');
  } else await Bun.write(output, bytes);
}
if (import.meta.main) await build(Bun.argv.slice(2));
