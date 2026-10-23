/** Owns conjugation pack assembly and target dispatch; not rules, canonical hashes or human review. */
import { ReviewsSchema, rowHash, writeArtifact, type Reviews } from './gate';
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

/** Strict metadata only: oracle forms belong in ignored reports, never in this file. */
export const OracleAttestSchema = z.strictObject({
  verbs: z.record(
    z.string(),
    z.strictObject({
      source: z.literal('morphalou-3.1'),
      ranAt: z.iso.datetime(),
      rowHash: z.string().regex(/^[a-f0-9]{64}$/),
      agree: z.number().int().nonnegative(),
      disagree: z.number().int().nonnegative(),
    }),
  ),
  decisions: z.array(
    z.strictObject({
      verbId: z.string().min(1),
      tense: z.string().min(1),
      person: z.string().min(1),
      ourForm: z.string().min(1),
      decision: z.enum(['keep', 'fix', 'variant']),
      note: z.string().trim().min(1),
    }),
  ),
});
export type OracleAttest = z.infer<typeof OracleAttestSchema>;

export interface BuildInputs {
  source: VerbSource;
  irregulars: Record<string, IrregularEntry>;
  reviews: Reviews;
  oracleAttest?: OracleAttest;
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

/** Owner review remains required; oracle attestations do not replace it. */
export function publishGate(verbs: Verb[]): string[] {
  return verbs
    .filter((verb) => verb.prov.status !== 'reviewed')
    .map((verb) => `${verb.id}: publish gate refuses ${verb.prov.status}; human review required`);
}

export function buildPack({ source, irregulars, reviews: rawReviews, oracleAttest }: BuildInputs) {
  const reviews = ReviewsSchema.parse(rawReviews);
  const attest = OracleAttestSchema.parse(oracleAttest ?? { verbs: {}, decisions: [] });
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
    const oracle = attest.verbs[verb.id];
    const oracleMatches = oracle?.rowHash === hash;
    if (oracleMatches) checkedAgainst.push('morphalou-3.1');
    else if (oracle) report.push(`${verb.id}: stale Morphalou attestation ignored (row hash changed)`);
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
    if (oracleMatches && oracle.ranAt.slice(0, 10) > verb.prov.checkedAt!) {
      verb.prov.checkedAt = oracle.ranAt.slice(0, 10);
    }
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
  const [source, irregulars, reviews, oracleAttest] = await Promise.all([
    Bun.file(new URL('../../data/grammar-pack/verbs.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/grammar-pack/irregulars.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/grammar-pack/reviews.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/grammar-pack/oracle-attest.json', import.meta.url)).json(),
  ]);
  return { source, irregulars, reviews, oracleAttest: OracleAttestSchema.parse(oracleAttest) };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: build.ts [--check]');
  const check = args[0] === '--check';
  const { pack, report } = buildPack(await readInputs());
  for (const line of report) console.log(line);
  await writeArtifact(new URL('../../src/data/grammar-pack/pack.json', import.meta.url), pack, check);
}
