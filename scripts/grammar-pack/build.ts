/** Owns deterministic pack assembly, review hashes and the publish gate; not conjugation rules or human review. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GrammarPackSchema, type Verb } from '../../src/types/grammarPack';
import { GOLDEN } from '../../tests/fixtures/grammarPackGolden';
import { checkControls, checkVerb } from './checks';
import {
  generateVerb,
  type GeneratedVerb,
  type IrregularEntry,
  type VerbSpec,
} from '../../src/services/conjugation/generate';

export interface VerbSource {
  packVersion: string;
  packDate: string;
  verbs: VerbSpec[];
  hMute?: string[];
}

export const ReviewsSchema = z.object({
  records: z.array(
    z.object({
      verbId: z.string().min(1),
      rowHash: z.string().regex(/^[a-f0-9]{64}$/),
      reviewedBy: z.string().trim().min(1),
      reviewedAt: z.iso.date(),
      reference: z.string().trim().min(1),
    }),
  ),
  rejected: z.array(z.string()),
});
export type Reviews = z.infer<typeof ReviewsSchema>;
export interface BuildInputs {
  source: VerbSource;
  irregulars: Record<string, IrregularEntry>;
  reviews: Reviews;
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

export function rowHash({ prov: _prov, ...row }: Verb): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(row)))
    .digest('hex');
}

/** Also used by the review CLI, which must work before the publish gate passes. */
export function generateRows(source: VerbSource, irregulars: BuildInputs['irregulars']) {
  const generated: GeneratedVerb[] = [];
  const failures: string[] = [];
  const failedIds = new Set<string>();
  for (const spec of source.verbs) {
    if (/^h/i.test(spec.infinitive.replace(/^(se |s’)/, '')) && !spec.hAspire && !source.hMute?.includes(spec.id)) {
      failures.push(`${spec.id}: h-initial verb needs hAspire: true or an entry in hMute`);
      failedIds.add(spec.id);
    }
    try {
      const g = generateVerb(spec, irregulars);
      generated.push(g);
      const issues = checkVerb(g);
      failures.push(...issues);
      if (issues.length) failedIds.add(spec.id);
    } catch (error) {
      failures.push(`${spec.id}: ${error instanceof Error ? error.message : String(error)}`);
      failedIds.add(spec.id);
    }
  }
  const controls = checkControls(generated);
  failures.push(...controls);
  for (const { verb } of generated) {
    if (controls.some((issue) => issue.startsWith(`${verb.id} `) || issue.startsWith(`${verb.id}:`))) {
      failedIds.add(verb.id);
    }
  }
  return { generated, failures, failedIds };
}

/** P2 requires human review until P3 supplies an independent oracle. */
export function publishGate(verbs: Verb[]): string[] {
  return verbs
    .filter((verb) => verb.prov.status !== 'reviewed')
    .map((verb) => `${verb.id}: publish gate refuses ${verb.prov.status}; human review required`);
}

export function buildPack({ source, irregulars, reviews: rawReviews }: BuildInputs) {
  const reviews = ReviewsSchema.parse(rawReviews);
  z.iso.date().parse(source.packDate);
  const { generated, failures, failedIds } = generateRows(source, irregulars);
  const verbs: Verb[] = [];
  const report: string[] = [];
  for (const { verb } of generated) {
    if (reviews.rejected.includes(verb.id)) {
      report.push(`${verb.id}: rejected; skipped`);
      continue;
    }
    const hash = rowHash(verb);
    // Records are append-only; the latest review of a verb supersedes earlier reviews.
    const review = [...reviews.records].reverse().find((record) => record.verbId === verb.id);
    if (review && review.rowHash !== hash) failures.push(`${verb.id}: review lapsed (row hash changed)`);
    const checkedAgainst: Verb['prov']['checkedAgainst'] = ['consistency'];
    if (Object.hasOwn(GOLDEN, verb.id)) checkedAgainst.push('control-verbs');
    const matching = review?.rowHash === hash ? review : undefined;
    verb.prov = matching
      ? {
          origin: verb.prov.origin,
          checkedAgainst: [...checkedAgainst, 'human'],
          checkedAt: matching.reviewedAt,
          status: 'reviewed',
          reviewedBy: matching.reviewedBy,
        }
      : {
          origin: verb.prov.origin,
          checkedAgainst,
          checkedAt: source.packDate,
          status: failedIds.has(verb.id) ? 'draft' : 'auto-checked',
        };
    verbs.push(verb);
  }
  failures.push(...publishGate(verbs));
  const parsed = GrammarPackSchema.safeParse({ schemaVersion: 1, packVersion: source.packVersion, verbs });
  if (!parsed.success) {
    failures.push(...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  if (failures.length || !parsed.success) throw new Error([...report, ...failures].join('\n'));
  return { pack: parsed.data, report };
}

export async function readInputs(): Promise<BuildInputs> {
  const [source, irregulars, reviews] = await Promise.all([
    Bun.file(new URL('../../data/grammar-pack/verbs.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/grammar-pack/irregulars.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/grammar-pack/reviews.json', import.meta.url)).json(),
  ]);
  return { source, irregulars, reviews };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: build.ts [--check]');
  const { pack, report } = buildPack(await readInputs());
  for (const line of report) console.log(line);
  const bytes = JSON.stringify(pack, null, 2) + '\n';
  const output = Bun.file(new URL('../../src/data/grammar-pack/pack.json', import.meta.url));
  if (args[0] === '--check') {
    if ((await output.text()) !== bytes) throw new Error('pack.json differs from the generated pack');
  } else {
    await Bun.write(output, bytes);
  }
}
