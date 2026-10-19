/** Owns build/review gate regressions with in-memory inputs; not owner reviews or the committed artifact. */
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildPack,
  deriveRules,
  ReviewsSchema,
  rowHash,
  type BuildInputs,
  type Candidate,
  type OracleAttest,
  type Reviews,
} from '../scripts/noun-gender/build';
import { NounGenderPackSchema, type Noun } from '../src/types/nounGender';

// Invented fixture rows, not French: nine -age nouns (eight masculine, one feminine exception).
const seed = (): Noun[] =>
  ['aaage', 'baage', 'caage', 'daage', 'eeage', 'faage', 'gaage', 'haage', 'iaage'].map((id) => ({
    id,
    lemma: id,
    gender: id === 'eeage' ? 'f' : 'm',
    prov: { origin: 'clarte-seed' as const, checkedAgainst: [], status: 'draft' as const },
  }));
const candidate = (): Candidate => ({ id: 'age', ending: 'age', gender: 'm' });
const ranAt = '2026-10-19T00:00:00.000Z';
const attest = (n: number, agree: number): OracleAttest => ({
  rules: {
    age: {
      ending: 'age',
      gender: 'm',
      n,
      agree,
      morphalouVersion: 'Version de fixture',
      ranAt,
      rowHash: rowHash(candidate()),
    },
  },
});
const derivedRule = () => ({
  id: 'age',
  ending: 'age',
  gender: 'm' as const,
  dictionary: { n: 100, agree: 80 },
  a1: { n: 9, agree: 8 },
  examples: ['aaage', 'baage', 'caage', 'daage', 'faage'],
  exceptions: ['eeage'],
});
const reviews = (nouns: Noun[]): Reviews => {
  const record = {
    reviewedBy: 'TEST ONLY',
    reviewedAt: '2026-10-18',
    reference: 'Invented test review, not an owner attestation',
  };
  return {
    records: [
      ...nouns.map(({ id, lemma, gender }) => ({ nounId: id, rowHash: rowHash({ id, lemma, gender }), ...record })),
      { ruleId: 'age', rowHash: rowHash(derivedRule()), ...record },
    ],
    rejected: [],
  };
};
const inputs = (over?: Partial<BuildInputs>): BuildInputs => {
  const nouns = seed();
  return {
    source: { packVersion: '0.1.0', nouns },
    candidates: [candidate()],
    reviews: reviews(nouns),
    attest: attest(100, 80),
    ...over,
  };
};
const bytes = (input: BuildInputs) => JSON.stringify(buildPack(input).pack, null, 2) + '\n';

function failure(input: BuildInputs): string {
  try {
    buildPack(input);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the build to fail');
}

test('a full build derives A1 figures, examples, exceptions and reviewed provenance', () => {
  const { pack, report } = buildPack(inputs());
  expect(report).toEqual([]);
  const rule = pack.rules[0]!;
  expect(rule).toMatchObject(derivedRule());
  expect(rule.prov).toEqual({
    origin: 'human',
    checkedAgainst: ['consistency', 'morphalou-3.1', 'human'],
    checkedAt: '2026-10-18',
    status: 'reviewed',
    reviewedBy: 'TEST ONLY',
  });
  expect(pack.nouns[0]!.prov).toEqual({
    origin: 'clarte-seed',
    checkedAgainst: ['human'],
    checkedAt: '2026-10-18',
    status: 'reviewed',
    reviewedBy: 'TEST ONLY',
  });
  expect(pack.packVersion).toBe('0.1.0');
});

test('the threshold drops candidates at 79% or n 29, never at 80% and n 30', () => {
  const at = (n: number, agree: number) => {
    const input = inputs({ attest: attest(n, agree) });
    return deriveRules(
      input.source.nouns.map(({ id, lemma, gender }) => ({ id, lemma, gender })),
      input.candidates,
      input.attest,
    );
  };
  expect(at(30, 24).rows).toHaveLength(1);
  expect(at(30, 23).drops).toEqual(['age: below threshold (dictionary 23/30); dropped']);
  expect(at(29, 29).drops).toEqual(['age: below threshold (dictionary 29/29); dropped']);
});

test('a candidate without an attest record, or with a lapsed one, is dropped', () => {
  const none = inputs({ attest: { rules: {} } });
  const noneDerived = deriveRules(
    none.source.nouns.map(({ id, lemma, gender }) => ({ id, lemma, gender })),
    none.candidates,
    none.attest,
  );
  expect(noneDerived.drops).toEqual(['age: no attest record; dropped']);
  const changed: Candidate = { ...candidate(), gender: 'f' };
  const lapsed = deriveRules(
    none.source.nouns.map(({ id, lemma, gender }) => ({ id, lemma, gender })),
    [changed],
    attest(100, 80),
  );
  expect(lapsed.drops).toEqual(['age: attest lapsed (candidate row changed); dropped']);
});

test('overlapping endings are derived independently: -e also matches every -age noun', () => {
  const input = inputs({
    candidates: [candidate(), { id: 'e', ending: 'e', gender: 'f' }],
    attest: {
      rules: {
        ...attest(100, 80).rules,
        e: {
          ending: 'e',
          gender: 'f',
          n: 100,
          agree: 90,
          morphalouVersion: 'Version de fixture',
          ranAt,
          rowHash: rowHash({ id: 'e', ending: 'e', gender: 'f' }),
        },
      },
    },
  });
  const { pack, report } = buildPack(input);
  expect(pack.rules.map(({ id }) => id)).toEqual(['age']);
  expect(report).toEqual(['e: only 1 agreeing A1 noun(s), 3 required; dropped']);
});

test('every shipped noun needs a review; a changed noun row lapses it', () => {
  const input = inputs();
  input.reviews.records = input.reviews.records.filter((record) => !('nounId' in record && record.nounId === 'baage'));
  expect(failure(input)).toContain('baage: publish gate refuses draft; human review required');
  const edited = inputs();
  edited.source.nouns[1]!.gender = 'f';
  expect(failure(edited)).toContain('baage: review lapsed (row hash changed)');
});

test('every shipped rule needs a review; a changed rule row lapses it', () => {
  const input = inputs();
  input.reviews.records = input.reviews.records.filter((record) => !('ruleId' in record));
  expect(failure(input)).toContain('age: publish gate refuses draft; human review required');
  const edited = inputs({ attest: attest(101, 81) });
  expect(failure(edited)).toContain('age: review lapsed (row hash changed)');
});

test('the latest review supersedes an older lapsed hash, but a latest lapsed hash fails', () => {
  const stale = {
    nounId: 'aaage',
    rowHash: '0'.repeat(64),
    reviewedBy: 'TEST ONLY',
    reviewedAt: '2026-10-18',
    reference: 'stale',
  };
  const input = inputs();
  input.reviews.records.unshift(stale);
  expect(() => buildPack(input)).not.toThrow();
  input.reviews.records.push({ ...stale, nounId: 'baage' });
  expect(failure(input)).toContain('baage: review lapsed (row hash changed)');
});

test('rejected nouns are skipped, logged and excluded from A1 figures, lapsing the rule review', () => {
  const input = inputs();
  input.reviews.rejected = ['eeage'];
  // Rejecting the exception changes the derived rule row, so the rule review lapses until re-recorded.
  expect(failure(input)).toContain('age: review lapsed (row hash changed)');
  input.reviews.records = input.reviews.records.map((record) =>
    'ruleId' in record
      ? { ...record, rowHash: rowHash({ ...derivedRule(), a1: { n: 8, agree: 8 }, exceptions: [] }) }
      : record,
  );
  const { pack, report } = buildPack(input);
  expect(report).toEqual(['eeage: rejected; skipped']);
  expect(pack.nouns.map(({ id }) => id)).not.toContain('eeage');
  expect(pack.rules[0]!.a1).toEqual({ n: 8, agree: 8 });
  expect(pack.rules[0]!.exceptions).toEqual([]);
});

test('an attest with agree above n fails the pack schema, not the threshold', () => {
  const input = inputs({ attest: attest(100, 101) });
  expect(failure(input)).toContain('agree exceeds n');
});

test('hash is sha256 of the canonical row, independent of key order', () => {
  const rule = derivedRule();
  const reordered = Object.fromEntries(Object.entries(rule).reverse());
  expect(rowHash(reordered)).toBe(rowHash(rule));
  const noun = { id: 'aaage', gender: 'm' as const, lemma: 'aaage' };
  expect(rowHash({ lemma: 'aaage', id: 'aaage', gender: 'm' })).toBe(rowHash(noun));
});

test('identical inputs produce identical bytes, no CJK, and a schema-valid pack', () => {
  const input = inputs();
  expect(bytes(input)).toBe(bytes(input));
  expect(bytes(input)).not.toMatch(/[\u3400-\u9fff\uf900-\ufaff]/u);
  expect(NounGenderPackSchema.safeParse(buildPack(input).pack).success).toBe(true);
});

test('review records reference exactly one row kind', () => {
  const record = reviews(seed()).records.find((r) => 'nounId' in r)!;
  expect(ReviewsSchema.safeParse({ records: [{ ...record, ruleId: 'age' }], rejected: [] }).success).toBe(false);
  const neither = { rowHash: '0'.repeat(64), reviewedBy: 'TEST ONLY', reviewedAt: '2026-10-18', reference: 'x' };
  expect(ReviewsSchema.safeParse({ records: [neither], rejected: [] }).success).toBe(false);
});

test('the CLI refuses to produce a pack while the owner has reviewed nothing', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const args of [[], ['--check']]) {
    const run = Bun.spawnSync({ cmd: ['bun', `${root}scripts/noun-gender/build.ts`, ...args], cwd: root });
    expect(run.exitCode).not.toBe(0);
    const stderr = new TextDecoder().decode(run.stderr);
    expect(stderr).toContain('publish gate refuses draft; human review required');
  }
  expect(existsSync(`${root}src/data/noun-gender/pack.json`)).toBe(false);
});
