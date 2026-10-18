/** Owns oracle regressions using invented CSV fixtures; not real Morphalou data or owner decisions. */
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPack,
  generateRows,
  OracleAttestSchema,
  readInputs,
  rowHash,
  type BuildInputs,
  type OracleAttest,
} from '../scripts/grammar-pack/build';
import { attestResults, compareVerb } from '../scripts/grammar-pack/oracle-diff';
import { loadMorphalou, morphalouForms, parseMorphalou } from '../scripts/grammar-pack/oracle-morphalou';
import { TENSES } from '../src/types/grammarPack';
import { CONTROL_SPECS, generateControls, IRREGULARS } from './fixtures/grammarPackVerbs';
import attestJson from '../data/grammar-pack/oracle-attest.json';

// Invented fixture rows, not copied from Morphalou. Tokens intentionally are not French forms.
const CSV = [
  ...Array.from({ length: 14 }, (_, i) => `Invented fixture preamble ${i + 1}`),
  `LEMME;;;;;;;;;FLEXION;;;;;;;;
GRAPHIE;ID;CATÉGORIE;SOUS CATÉGORIE;LOCUTION;GENRE;AUTRES LEMMES LIÉS;PHONÉTIQUE;ORIGINES;GRAPHIE;ID;NOMBRE;MODE;GENRE;TEMPS;PERSONNE;PHONÉTIQUE;ORIGINES
appeler;1;Verbe;;;-;;;fixture;fixture-one;11;singular;indicative;-;present;firstPerson;;fixture
;;;;;;;;;fixture-two;12;singular;indicative;-;present;secondPerson;;fixture
;;;;;;;;;fixture-three;13;singular;indicative;-;present;thirdPerson;;fixture
;;;;;;;;;fixture-four;14;plural;indicative;-;present;firstPerson;;fixture
;;;;;;;;;fixture-five;15;plural;indicative;-;present;secondPerson;;fixture
;;;;;;;;;fixture-six;16;plural;indicative;-;present;thirdPerson;;fixture
;;;;;;;;;fixture-imperfect;17;singular;indicative;-;imperfect;firstPerson;;fixture
;;;;;;;;;fixture-future;18;singular;indicative;-;future;firstPerson;;fixture
;;;;;;;;;fixture-conditional;19;singular;conditional;-;present;firstPerson;;fixture
;;;;;;;;;fixture-subjunctive;20;singular;subjunctive;-;present;firstPerson;;fixture
;;;;;;;;;fixture-command;21;singular;imperative;-;present;secondPerson;;fixture
;;;;;;;;;fixture-command-plural;22;plural;imperative;-;present;firstPerson;;fixture
;;;;;;;;;fixture-command-vous;23;plural;imperative;-;present;secondPerson;;fixture
;;;;;;;;;fixture-present;24;-;participle;-;present;-;;fixture
;;;;;;;;;fixture-past;25;invariable;participle;invariable;past;-;;fixture
s'appeler;2;Verbe;;;-;;;fixture;s'appeler;26;-;infinitive;-;-;-;;fixture
appeler;3;Verbe;auxiliaire;;-;;;fixture;fixture-one;27;singular;indicative;-;present;firstPerson;;fixture
;;;;;;;;;fixture-extra;28;singular;indicative;-;present;firstPerson;;fixture
other;4;Verbe;;;-;;;fixture;fixture-ms;29;singular;participle;masculine;past;-;;fixture
;;;;;;;;;fixture-fs;30;singular;participle;feminine;past;-;;fixture
;;;;;;;;;fixture-mp;31;plural;participle;masculine;past;-;;fixture
;;;;;;;;;fixture-fp;32;plural;participle;feminine;past;-;;fixture`,
].join('\n');
const parse = (csv = CSV) => parseMorphalou(csv.split('\n'));
const emptyAttest = (): OracleAttest => ({ verbs: {}, decisions: [] });
const ranAt = '2026-10-19T00:00:00.000Z';

function fixtureVerb() {
  const verb = generateControls()[3].verb;
  for (const tense of TENSES) verb.tenses[tense] = {};
  verb.tenses.present['1sg'] = { lead: 'ignored', forms: ['fixture-one'] };
  verb.tenses.imperatif!['2sg'] = { lead: '', forms: ['fixture-command-toi'] };
  verb.participles = {
    present: 'fixture-present',
    past: { ms: 'fixture-past', fs: 'fixture-past', mp: 'fixture-past', fp: 'fixture-past' },
  };
  return verb;
}

function buildInputs(): BuildInputs {
  return {
    source: { packVersion: '0.1.0', packDate: '2026-10-18', verbs: structuredClone(CONTROL_SPECS) },
    irregulars: structuredClone(IRREGULARS),
    reviews: {
      records: generateControls().map(({ verb }) => ({
        verbId: verb.id,
        rowHash: rowHash(verb),
        reviewedBy: 'TEST ONLY',
        reviewedAt: '2026-10-18',
        reference: 'Invented test review, not an owner attestation',
      })),
      rejected: [],
    },
    oracleAttest: emptyAttest(),
  };
}

test('tracks blank lemma rows, merges later blocks and deduplicates forms', async () => {
  const index = await parse();
  expect(morphalouForms(index, 'appeler', 'present', '1sg')).toEqual(['fixture-extra', 'fixture-one']);
  expect(morphalouForms(index, 'appeler', 'present', '2sg')).toEqual(['fixture-two']);
  const dir = await mkdtemp(join(tmpdir(), 'relire-oracle-fixture-'));
  try {
    await Bun.write(join(dir, 'verb_Morphalou3.1_CSV.csv'), CSV.replace(/\n/g, '\r\n') + '\r\n');
    expect(await loadMorphalou(dir)).toEqual(index);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('maps all simple moods, tenses and persons, including the three imperatives', async () => {
  const index = await parse();
  for (const [i, person] of ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'].entries()) {
    expect(morphalouForms(index, 'appeler', 'present', person)).toContain(
      `fixture-${['one', 'two', 'three', 'four', 'five', 'six'][i]}`,
    );
  }
  for (const [tense, token] of [
    ['imparfait', 'fixture-imperfect'],
    ['futur', 'fixture-future'],
    ['conditionnel', 'fixture-conditional'],
    ['subjonctif', 'fixture-subjunctive'],
  ] as const)
    expect(morphalouForms(index, 'appeler', tense, '1sg')).toEqual([token]);
  for (const [person, token] of [
    ['2sg', 'fixture-command'],
    ['1pl', 'fixture-command-plural'],
    ['2pl', 'fixture-command-vous'],
  ])
    expect(morphalouForms(index, 'appeler', 'imperatif', person)).toEqual([token]);
});

test('maps present participles, gender/number and invariable past participles', async () => {
  const index = await parse();
  expect(morphalouForms(index, 'appeler', 'participlePresent', '-')).toEqual(['fixture-present']);
  for (const person of ['ms', 'fs', 'mp', 'fp']) {
    expect(morphalouForms(index, 'appeler', 'participlePast', person)).toEqual(['fixture-past']);
    expect(morphalouForms(index, 'other', 'participlePast', person)).toEqual([`fixture-${person}`]);
  }
});

test('looks up pronominal lemmas under the bare lemma, for both apostrophes and se', async () => {
  const index = await parse();
  for (const infinitive of ["s'appeler", 's’appeler', 'se appeler']) {
    expect(morphalouForms(index, infinitive, 'present', '2sg')).toEqual(['fixture-two']);
  }
  expect(morphalouForms(index, 'unknown', 'present', '1sg')).toEqual([]);
});

test('strips imperative clitics, skips leads/compound tenses and detects oracle-extra without copying its token', async () => {
  const verb = fixtureVerb();
  verb.tenses.passeCompose['1sg'] = { lead: 'ignored', forms: ['not-in-oracle'] };
  const result = compareVerb(verb, await parse(), []);
  expect(result.agree).toBe(6);
  expect(result.disagreements).toEqual([
    {
      verbId: 's-appeler',
      tense: 'present',
      person: '1sg',
      ourForm: 'fixture-one',
      oracleForms: ['fixture-extra', 'fixture-one'],
      kind: 'oracle-extra',
    },
  ]);
  expect(result.uncovered).toEqual(result.disagreements);
});

test('detects missing primary and variant forms, and only an exact owner decision covers each token', async () => {
  const verb = fixtureVerb();
  verb.tenses.present['1sg']!.forms = ['fixture-wrong', 'fixture-one', 'fixture-wrong-variant'];
  const index = await parse();
  const result = compareVerb(verb, index, []);
  expect(result.disagreements.map(({ kind, ourForm }) => [kind, ourForm])).toEqual([
    ['our-form-missing', 'fixture-wrong'],
    ['our-form-missing', 'fixture-wrong-variant'],
    ['oracle-extra', 'fixture-wrong'],
  ]);
  // Invented test decision only, never written to the owner attest file.
  const decision = {
    verbId: verb.id,
    tense: 'present',
    person: '1sg',
    ourForm: 'fixture-wrong',
    decision: 'keep' as const,
    note: 'Fixture only',
  };
  expect(compareVerb(verb, index, [decision]).uncovered.map(({ ourForm }) => ourForm)).toEqual([
    'fixture-wrong-variant',
  ]);
  for (const field of ['verbId', 'tense', 'person', 'ourForm']) {
    expect(compareVerb(verb, index, [{ ...decision, [field]: 'different' }]).uncovered).toHaveLength(3);
  }
});

test('attests only zero-uncovered results, stores current hashes and never writes decisions or oracle forms', async () => {
  const index = await parse();
  const bad = fixtureVerb();
  const good = fixtureVerb();
  good.id = 'fixture-good';
  good.tenses.present['1sg']!.forms.push('fixture-extra');
  const previous = emptyAttest();
  const next = attestResults(previous, [compareVerb(bad, index, []), compareVerb(good, index, [])], ranAt);
  expect(next).toEqual({
    verbs: {
      'fixture-good': {
        source: 'morphalou-3.1',
        ranAt,
        rowHash: rowHash(good),
        agree: 7,
        disagree: 0,
      },
    },
    decisions: [],
  });
  expect(previous).toEqual(emptyAttest());
});

test('build adds oracle provenance only for a matching hash, preserving owner review and content hash', () => {
  const input = buildInputs();
  const before = buildPack(input).pack.verbs[0];
  input.oracleAttest!.verbs.etre = { source: 'morphalou-3.1', ranAt, rowHash: rowHash(before), agree: 38, disagree: 0 };
  const { pack, report } = buildPack(input);
  expect(report).toEqual([]);
  expect(pack.verbs[0].prov.checkedAgainst).toEqual(['consistency', 'control-verbs', 'morphalou-3.1', 'human']);
  expect(pack.verbs[0].prov.status).toBe('reviewed');
  expect(pack.verbs[0].prov.reviewedBy).toBe('TEST ONLY');
  expect(pack.verbs[0].prov.checkedAt).toBe('2026-10-19');
  expect(rowHash(pack.verbs[0])).toBe(rowHash(before));
  expect(pack.verbs[1].prov.checkedAgainst).not.toContain('morphalou-3.1');
});

test('build ignores and reports stale oracle attestations without failing', () => {
  const input = buildInputs();
  input.oracleAttest!.verbs.etre = { source: 'morphalou-3.1', ranAt, rowHash: '0'.repeat(64), agree: 38, disagree: 0 };
  const { pack, report } = buildPack(input);
  expect(pack.verbs[0].prov.checkedAgainst).not.toContain('morphalou-3.1');
  expect(report).toEqual(['etre: stale Morphalou attestation ignored (row hash changed)']);
});

test('header mismatches fail with the actual line, including the block header', async () => {
  const failure = (csv: string) =>
    parse(csv).then(
      () => 'unexpected success',
      (error: Error) => error.message,
    );
  expect(await failure(CSV.replace('GRAPHIE;ID;', 'BROKEN;ID;'))).toContain('got BROKEN;ID;');
  expect(await failure(CSV.replace('LEMME;;;;;;;;;FLEXION;;;;;;;;', 'WRONG BLOCKS'))).toContain('got WRONG BLOCKS');
  expect(await failure('short file')).toContain('header missing');
  expect(await failure(CSV + '\nbad;row')).toContain('expected 18 columns; got bad;row');
});

test('committed attest has exactly the allowed metadata shapes and only already-shipped ourForm tokens', async () => {
  expect(OracleAttestSchema.safeParse(attestJson).success).toBe(true);
  const { source, irregulars } = await readInputs();
  const { generated } = generateRows(source, irregulars);
  for (const decision of attestJson.decisions as OracleAttest['decisions']) {
    const verb = generated.find(({ verb }) => verb.id === decision.verbId)!.verb;
    const tokens = [
      verb.participles.present,
      ...Object.values(verb.participles.past),
      ...Object.values(verb.tenses).flatMap((cells) => Object.values(cells ?? {}).flatMap(({ forms }) => forms)),
    ];
    expect(tokens).toContain(decision.ourForm);
  }
  const record = { source: 'morphalou-3.1', ranAt, rowHash: '0'.repeat(64), agree: 1, disagree: 0 };
  const decision = {
    verbId: 'fixture',
    tense: 'present',
    person: '1sg',
    ourForm: 'fixture-one',
    decision: 'keep',
    note: 'Fixture only',
  };
  expect(OracleAttestSchema.safeParse({ ...emptyAttest(), dump: [] }).success).toBe(false);
  expect(
    OracleAttestSchema.safeParse({ verbs: { fixture: { ...record, oracleForms: [] } }, decisions: [] }).success,
  ).toBe(false);
  expect(OracleAttestSchema.safeParse({ verbs: {}, decisions: [{ ...decision, oracleForms: [] }] }).success).toBe(
    false,
  );
});
