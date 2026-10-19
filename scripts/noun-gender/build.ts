/**
 * Owns deterministic noun-gender pack assembly: the candidate/attest/review
 * file schemas, the derived rule rows (A1 figures, examples, exceptions), the
 * publish threshold and the review-hash gate. Does not own the Morphalou
 * measurement (measure.ts), the owner review sheet (review.ts) or loading.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { NounSchema, NounGenderPackSchema, type Gender, type Noun, type NounRule } from '../../src/types/nounGender';

const slug = z.string().regex(/^[a-z]+(-[a-z]+)*$/);
const rowHashField = z.string().regex(/^[a-f0-9]{64}$/);

/** Publish threshold (NQ2 default): dictionary accuracy at least 80% with n >= 30. */
export const THRESHOLD = { accuracyPercent: 80, minN: 30 };

/** The owner's call on one candidate: never ship it (hold) or ship it below the threshold (override). */
export const DecisionSchema = z.strictObject({ kind: z.enum(['hold', 'override']), reason: z.string().trim().min(1) });

export const CandidatesSchema = z.array(
  z.strictObject({
    id: slug,
    ending: z.string().trim().min(1),
    gender: z.enum(['m', 'f']),
    decision: DecisionSchema.optional(),
  }),
);
export type Candidate = z.infer<typeof CandidatesSchema>[number];

export const NounsSourceSchema = z.object({
  packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  nouns: z.array(NounSchema),
});
export type NounsSource = z.infer<typeof NounsSourceSchema>;

/** Review records reference a rule or a noun; hashes only, append-only, owner-written. */
export const ReviewsSchema = z.object({
  records: z.array(
    z.union([
      z.strictObject({
        ruleId: slug,
        rowHash: rowHashField,
        reviewedBy: z.string().trim().min(1),
        reviewedAt: z.iso.date(),
        reference: z.string().trim().min(1),
      }),
      z.strictObject({
        nounId: slug,
        rowHash: rowHashField,
        reviewedBy: z.string().trim().min(1),
        reviewedAt: z.iso.date(),
        reference: z.string().trim().min(1),
      }),
    ]),
  ),
  rejected: z.array(slug),
});
export type Reviews = z.infer<typeof ReviewsSchema>;

/** Strict metadata only: integer counts, the Morphalou version line, run date and the candidate-row hash. */
export const OracleAttestRuleSchema = z.strictObject({
  ending: z.string().trim().min(1),
  gender: z.enum(['m', 'f']),
  n: z.number().int().nonnegative(),
  agree: z.number().int().nonnegative(),
  morphalouVersion: z.string().trim().min(1),
  ranAt: z.iso.datetime(),
  rowHash: rowHashField,
});
export const OracleAttestSchema = z.strictObject({ rules: z.record(z.string(), OracleAttestRuleSchema) });
export type OracleAttest = z.infer<typeof OracleAttestSchema>;

export interface BuildInputs {
  source: NounsSource;
  candidates: Candidate[];
  reviews: Reviews;
  attest: OracleAttest;
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

/** sha256 of the canonical row without provenance; a changed row lapses its review. */
export function rowHash(row: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(row)))
    .digest('hex');
}

export type NounRow = Pick<Noun, 'id' | 'lemma' | 'gender'>;
/** A derived rule row without provenance; exactly what is hashed and shipped. */
export interface RuleRow {
  id: string;
  ending: string;
  gender: Gender;
  dictionary: { n: number; agree: number };
  a1: { n: number; agree: number };
  examples: string[];
  exceptions: string[];
}

/** A1 figures over the noun list: n counts every lemma with the ending, agree the predicted gender. */
function a1Figures(nouns: NounRow[], ending: string, gender: Gender) {
  const matching = nouns.filter((noun) => noun.lemma.endsWith(ending));
  return {
    n: matching.length,
    agree: matching.filter((noun) => noun.gender === gender).length,
  };
}

/**
 * Derives the shippable rule rows from the candidates, the attest and the kept
 * nouns. Also used by the review CLI, which must work before the gate passes.
 * A held candidate never ships and is listed with its reason. Otherwise a
 * candidate with no attest record, a lapsed attest, a dictionary figure below
 * the threshold (unless the owner overrode it), or fewer than 3 agreeing A1
 * nouns is dropped with a reason, never softened. An override keeps the honest
 * dictionary and A1 figures.
 */
export function deriveRules(nouns: NounRow[], candidates: Candidate[], attest: OracleAttest) {
  const rows: RuleRow[] = [];
  const drops: string[] = [];
  for (const candidate of candidates) {
    if (candidate.decision?.kind === 'hold') {
      drops.push(`${candidate.id}: held by the owner (${candidate.decision.reason}); not shipped`);
      continue;
    }
    const record = attest.rules[candidate.id];
    if (!record) {
      drops.push(`${candidate.id}: no attest record; dropped`);
      continue;
    }
    if (record.rowHash !== rowHash(candidate)) {
      drops.push(`${candidate.id}: attest lapsed (candidate row changed); dropped`);
      continue;
    }
    if (record.n < THRESHOLD.minN || record.agree * 100 < THRESHOLD.accuracyPercent * record.n) {
      if (candidate.decision?.kind !== 'override') {
        drops.push(`${candidate.id}: below threshold (dictionary ${record.agree}/${record.n}); dropped`);
        continue;
      }
    }
    const a1 = a1Figures(nouns, candidate.ending, candidate.gender);
    const examples = nouns
      .filter((noun) => noun.lemma.endsWith(candidate.ending) && noun.gender === candidate.gender)
      .slice(0, 5)
      .map((noun) => noun.id);
    if (examples.length < 3) {
      drops.push(`${candidate.id}: only ${examples.length} agreeing A1 noun(s), 3 required; dropped`);
      continue;
    }
    const exceptions = nouns
      .filter((noun) => noun.lemma.endsWith(candidate.ending) && noun.gender !== candidate.gender)
      .map((noun) => noun.id);
    rows.push({
      id: candidate.id,
      ending: candidate.ending,
      gender: candidate.gender,
      dictionary: { n: record.n, agree: record.agree },
      a1,
      examples,
      exceptions,
    });
  }
  return { rows, drops };
}

export function buildPack({ source, candidates, reviews: rawReviews, attest: rawAttest }: BuildInputs) {
  const reviews = ReviewsSchema.parse(rawReviews);
  const attest = OracleAttestSchema.parse(rawAttest);
  const failures: string[] = [];
  const report: string[] = [];

  const nouns: Noun[] = [];
  for (const noun of source.nouns) {
    if (reviews.rejected.includes(noun.id)) {
      report.push(`${noun.id}: rejected; skipped`);
      continue;
    }
    const row: NounRow = { id: noun.id, lemma: noun.lemma, gender: noun.gender };
    // Records are append-only; the latest review of a noun supersedes earlier reviews.
    const review = [...reviews.records].reverse().find((record) => 'nounId' in record && record.nounId === noun.id);
    if (review && review.rowHash !== rowHash(row)) failures.push(`${noun.id}: review lapsed (row hash changed)`);
    const matching = review?.rowHash === rowHash(row) ? review : undefined;
    nouns.push(
      matching
        ? {
            ...noun,
            prov: {
              origin: noun.prov.origin,
              checkedAgainst: [...noun.prov.checkedAgainst, 'human'],
              checkedAt: matching.reviewedAt,
              status: 'reviewed',
              reviewedBy: matching.reviewedBy,
            },
          }
        : { ...noun, prov: { origin: noun.prov.origin, checkedAgainst: noun.prov.checkedAgainst, status: 'draft' } },
    );
    if (!matching) failures.push(`${noun.id}: publish gate refuses draft; human review required`);
  }

  const { rows, drops } = deriveRules(
    nouns.map(({ id, lemma, gender }) => ({ id, lemma, gender })),
    candidates,
    attest,
  );
  report.push(...drops);
  const rules: NounRule[] = [];
  for (const row of rows) {
    const decision = candidates.find((candidate) => candidate.id === row.id)?.decision;
    if (decision?.kind === 'override') {
      report.push(
        `${row.id}: owner override (dictionary ${row.dictionary.agree}/${row.dictionary.n}; ${decision.reason}); shipped`,
      );
    }
    const review = [...reviews.records].reverse().find((record) => 'ruleId' in record && record.ruleId === row.id);
    if (review && review.rowHash !== rowHash(row)) failures.push(`${row.id}: review lapsed (row hash changed)`);
    const matching = review?.rowHash === rowHash(row) ? review : undefined;
    rules.push(
      matching
        ? {
            ...row,
            prov: {
              origin: 'human',
              checkedAgainst: ['consistency', 'morphalou-3.1', 'human'],
              checkedAt: matching.reviewedAt,
              status: 'reviewed',
              reviewedBy: matching.reviewedBy,
            },
          }
        : { ...row, prov: { origin: 'human', checkedAgainst: ['consistency', 'morphalou-3.1'], status: 'draft' } },
    );
    if (!matching) failures.push(`${row.id}: publish gate refuses draft; human review required`);
  }

  const parsed = NounGenderPackSchema.safeParse({ schemaVersion: 1, packVersion: source.packVersion, nouns, rules });
  if (!parsed.success) {
    failures.push(...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  if (failures.length || !parsed.success) throw new Error([...report, ...failures].join('\n'));
  return { pack: parsed.data, report };
}

export async function readInputs(): Promise<BuildInputs> {
  const [source, candidates, reviews, attest] = await Promise.all([
    Bun.file(new URL('../../data/noun-gender/nouns.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/noun-gender/candidates.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/noun-gender/reviews.json', import.meta.url)).json(),
    Bun.file(new URL('../../data/noun-gender/oracle-attest.json', import.meta.url)).json(),
  ]);
  return {
    source: NounsSourceSchema.parse(source),
    candidates: CandidatesSchema.parse(candidates),
    reviews: ReviewsSchema.parse(reviews),
    attest: OracleAttestSchema.parse(attest),
  };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: build.ts [--check]');
  const { pack, report } = buildPack(await readInputs());
  for (const line of report) console.log(line);
  const bytes = JSON.stringify(pack, null, 2) + '\n';
  const output = Bun.file(new URL('../../src/data/noun-gender/pack.json', import.meta.url));
  if (args[0] === '--check') {
    if (!(await output.exists())) throw new Error('no committed src/data/noun-gender/pack.json to check against');
    if ((await output.text()) !== bytes) throw new Error('pack.json differs from the generated pack');
  } else {
    await Bun.write(output, bytes);
  }
}
