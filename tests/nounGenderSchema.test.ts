/** Owns noun-gender schema regressions with invented fixtures; not the build gate or measurement. */
import { expect, test } from 'bun:test';
import {
  NounGenderPackSchema,
  NounProvenanceSchema,
  type Noun,
  type NounGenderPack,
  type NounRule,
} from '../src/types/nounGender';
import nounsJson from '../data/noun-gender/nouns.json';
import candidatesJson from '../data/noun-gender/candidates.json';
import reviewsJson from '../data/noun-gender/reviews.json';
import attestJson from '../data/noun-gender/oracle-attest.json';
import { CandidatesSchema, NounsSourceSchema, OracleAttestSchema, ReviewsSchema } from '../scripts/noun-gender/build';

const prov = (status: Noun['prov']['status'] = 'reviewed'): Noun['prov'] => ({
  origin: 'human',
  checkedAgainst: ['human'],
  checkedAt: '2026-10-19',
  status,
  ...(status === 'reviewed' ? { reviewedBy: 'TEST ONLY' } : {}),
});
const noun = (id: string, lemma: string, gender: Noun['gender']): Noun => ({
  id,
  lemma,
  gender,
  prov: prov(),
});
// Invented fixture rows: 9 nouns ending in -age (8 masculine, 1 feminine exception).
const nouns: Noun[] = [
  noun('aaage', 'aaage', 'm'),
  noun('baage', 'baage', 'm'),
  noun('caage', 'caage', 'm'),
  noun('daage', 'daage', 'm'),
  noun('eeage', 'eeage', 'f'),
  noun('faage', 'faage', 'm'),
  noun('gaage', 'gaage', 'm'),
  noun('haage', 'haage', 'm'),
  noun('iaage', 'iaage', 'm'),
  noun('zzoir', 'zzoir', 'm'),
];
const rule: NounRule = {
  id: 'age',
  ending: 'age',
  gender: 'm',
  dictionary: { n: 100, agree: 80 },
  a1: { n: 9, agree: 8 },
  examples: ['aaage', 'baage', 'caage', 'daage', 'faage'],
  exceptions: ['eeage'],
  prov: prov(),
};
const pack = (): NounGenderPack => ({
  schemaVersion: 1,
  packVersion: '0.1.0',
  nouns: structuredClone(nouns),
  rules: [structuredClone(rule)],
});

test('a valid pack passes', () => {
  expect(NounGenderPackSchema.safeParse(pack()).success).toBe(true);
});

test('a candidate decision is a hold or an override with a one-sentence reason, nothing else', () => {
  const base = { id: 'age', ending: 'age', gender: 'm' };
  const parse = (decision: unknown) => CandidatesSchema.safeParse([{ ...base, decision }]).success;
  expect(CandidatesSchema.safeParse([base]).success).toBe(true);
  expect(parse({ kind: 'hold', reason: 'Split by meaning first.' })).toBe(true);
  expect(parse({ kind: 'override', reason: 'Every A1 noun agrees.' })).toBe(true);
  expect(parse({ kind: 'hold' })).toBe(false);
  expect(parse({ kind: 'hold', reason: '   ' })).toBe(false);
  expect(parse({ kind: 'skip', reason: 'Unknown kind.' })).toBe(false);
  expect(parse({ reason: 'No kind.' })).toBe(false);
  expect(parse({ kind: 'hold', reason: 'Extra key.', until: '2027' })).toBe(false);
});

test('duplicate noun and rule ids are rejected', () => {
  const duplicate = pack();
  duplicate.nouns.push(structuredClone(duplicate.nouns[0]!));
  expect(NounGenderPackSchema.safeParse(duplicate).error!.issues.map((i) => i.message)).toContain('duplicate id aaage');
  const two = pack();
  two.rules.push(structuredClone(two.rules[0]!));
  expect(NounGenderPackSchema.safeParse(two).error!.issues.map((i) => i.message)).toContain('duplicate id age');
});

test('only reviewed rows ship: draft and rejected nouns and rules are rejected', () => {
  const draft = pack();
  draft.nouns[0]!.prov = prov('draft');
  expect(NounGenderPackSchema.safeParse(draft).error!.issues.map((i) => i.message)).toContain(
    'aaage has status draft; only reviewed ships',
  );
  const rejected = pack();
  rejected.rules[0]!.prov = prov('rejected');
  expect(NounGenderPackSchema.safeParse(rejected).error!.issues.map((i) => i.message)).toContain(
    'age has status rejected; only reviewed ships',
  );
});

test('stated a1 figures must equal the figures recomputed from the noun list', () => {
  const wrong = pack();
  wrong.rules[0]!.a1 = { n: 9, agree: 9 };
  expect(NounGenderPackSchema.safeParse(wrong).error!.issues.map((i) => i.message)).toContain(
    'age states a1 9/9; the noun list gives 8/9',
  );
  wrong.rules[0]!.a1 = { n: 8, agree: 8 };
  expect(NounGenderPackSchema.safeParse(wrong).error!.issues.map((i) => i.message)).toContain(
    'age states a1 8/8; the noun list gives 8/9',
  );
});

test('examples and exceptions must exist, end with the ending, agree or disagree', () => {
  const unknown = pack();
  unknown.rules[0]!.examples = ['aaage', 'baage', 'nowhere'];
  expect(NounGenderPackSchema.safeParse(unknown).error!.issues.map((i) => i.message)).toContain(
    'age examples names unknown noun nowhere',
  );
  const disagrees = pack();
  disagrees.rules[0]!.examples = ['aaage', 'baage', 'eeage'];
  expect(NounGenderPackSchema.safeParse(disagrees).error!.issues.map((i) => i.message)).toContain('eeage is f, not m');
  const agrees = pack();
  agrees.rules[0]!.exceptions = ['aaage'];
  expect(NounGenderPackSchema.safeParse(agrees).error!.issues.map((i) => i.message)).toContain('aaage is m, not f');
  const offEnding = pack();
  offEnding.rules[0]!.exceptions = ['eeage', 'zzoir'];
  expect(NounGenderPackSchema.safeParse(offEnding).error!.issues.map((i) => i.message)).toContain(
    'zzoir does not end in age',
  );
});

test('examples need 3 to 5 entries and agree cannot exceed n', () => {
  const few = pack();
  few.rules[0]!.examples = ['aaage', 'baage'];
  expect(
    NounGenderPackSchema.safeParse(few).error!.issues.some((i) => i.path.join('.').startsWith('rules.0.examples')),
  ).toBe(true);
  const many = pack();
  many.rules[0]!.examples = ['aaage', 'baage', 'caage', 'daage', 'faage', 'gaage'];
  expect(
    NounGenderPackSchema.safeParse(many).error!.issues.some((i) => i.path.join('.').startsWith('rules.0.examples')),
  ).toBe(true);
  const dictionary = pack();
  dictionary.rules[0]!.dictionary = { n: 10, agree: 11 };
  expect(NounGenderPackSchema.safeParse(dictionary).error!.issues.map((i) => i.message)).toContain('agree exceeds n');
  const a1 = pack();
  a1.rules[0]!.a1 = { n: 9, agree: 10 };
  expect(NounGenderPackSchema.safeParse(a1).error!.issues.map((i) => i.message)).toContain('agree exceeds n');
});

test('provenance requires checkedAt unless draft, reviewedBy when reviewed', () => {
  expect(NounProvenanceSchema.safeParse({ origin: 'human', checkedAgainst: [], status: 'draft' }).success).toBe(true);
  expect(
    NounProvenanceSchema.safeParse({ origin: 'human', checkedAgainst: [], status: 'reviewed', checkedAt: '2026-10-19' })
      .success,
  ).toBe(false);
  expect(
    NounProvenanceSchema.safeParse({ origin: 'human', checkedAgainst: [], status: 'reviewed', reviewedBy: 'x' })
      .success,
  ).toBe(false);
});

test('strings are NFC and endings are lowercase letters', () => {
  const nfd = pack();
  nfd.nouns[0]!.lemma = 'e\u0301aage';
  expect(NounGenderPackSchema.safeParse(nfd).error!.issues.map((i) => i.message)).toContain('string is not NFC');
  const upper = pack();
  upper.rules[0]!.ending = 'Age';
  expect(NounGenderPackSchema.safeParse(upper).error!.issues.map((i) => i.message)).toContain(
    'ending must be lowercase letters only',
  );
});

test("committed source files parse; the owner's review lives in reviews.json, never in the source rows", () => {
  const source = NounsSourceSchema.parse(nounsJson);
  expect(source.packVersion).toBe('0.1.0');
  expect(source.nouns.length).toBeGreaterThanOrEqual(40);
  for (const noun of source.nouns) {
    expect(['clarte-seed', 'agy-drafted', 'human']).toContain(noun.prov.origin);
    expect(noun.prov.status).toBe('draft');
    expect(noun.prov.reviewedBy).toBeUndefined();
    expect(noun.id).toBe(noun.lemma.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  }
  const candidates = CandidatesSchema.parse(candidatesJson);
  expect(candidates).toHaveLength(19);
  expect(candidates.map(({ id, gender }) => `${id}:${gender}`)).toEqual([
    'tion:f',
    'sion:f',
    'te:f',
    'ure:f',
    'ette:f',
    'ance:f',
    'ence:f',
    'ie:f',
    'age:m',
    'ment:m',
    'isme:m',
    'eau:m',
    'oir:m',
    'ier:m',
    'eur:m',
    'e:f',
    'ee:f',
    'esse:f',
    'ude:f',
  ]);
  // The owner's individual decisions of 2026-10-19; every other candidate follows the default threshold.
  expect(candidates.filter(({ decision }) => decision).map(({ id, decision }) => `${id}:${decision!.kind}`)).toEqual([
    'ure:override',
    'eur:hold',
  ]);
  // The owner's review of 2026-10-19 (issue #11): one record per noun and per shippable rule; -eur is held and -e is below the threshold.
  const reviews = ReviewsSchema.parse(reviewsJson);
  expect(reviews.rejected).toEqual([]);
  const reviewed = (kind: 'nounId' | 'ruleId') =>
    reviews.records.flatMap((record) => (kind in record ? [(record as Record<string, string>)[kind]] : [])).sort();
  expect(reviewed('nounId')).toEqual(source.nouns.map(({ id }) => id).sort());
  expect(reviewed('ruleId')).toEqual(
    candidates
      .map(({ id }) => id)
      .filter((id) => id !== 'eur' && id !== 'e')
      .sort(),
  );
  // The owner confirmed (NQ6) that the measured counts may be committed: one record per candidate, integers only.
  const attest = OracleAttestSchema.parse(attestJson);
  expect(Object.keys(attest.rules).sort()).toEqual(candidates.map(({ id }) => id).sort());
  for (const record of Object.values(attest.rules)) expect(record.agree).toBeLessThanOrEqual(record.n);
});
