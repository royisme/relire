/** Owns measurement regressions using invented CSV fixtures; not real Morphalou data or the build gate. */
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attestMeasurement,
  loadCommonNounCsv,
  measureCandidate,
  readCommonNounCsv,
  MeasurementSchema,
  type Measurement,
} from '../scripts/noun-gender/measure';
import { OracleAttestSchema, rowHash } from '../scripts/noun-gender/build';

// Invented fixture rows, not copied from Morphalou. Tokens intentionally are not French words.
const HEADER =
  'GRAPHIE;ID;CATÉGORIE;SOUS CATÉGORIE;LOCUTION;GENRE;AUTRES LEMMES LIÉS;PHONÉTIQUE;ORIGINES;GRAPHIE;ID;NOMBRE;MODE;GENRE;TEMPS;PERSONNE;PHONÉTIQUE;ORIGINES';
const lemmaRow = (lemma: string, id: number, genre: string, locution = '') =>
  `${lemma};${id};Nom commun;fixture-sub;${locution};${genre};;fixture-phon;fixture-origin;${lemma};${id}s;singular;-;-;-;-;fixture-phon;fixture-origin`;
const formRow = (form: string, id: number) => `;;;;;;;;;${form};${id};plural;-;-;-;-;fixture-phon;fixture-origin`;
const CSV = [
  ...Array.from({ length: 13 }, (_, i) => `Invented fixture preamble ${i + 1}`),
  'Version de fixture-6/2016',
  'LEMME;;;;;;;;;FLEXION;;;;;;;;',
  HEADER,
  lemmaRow('xation', 1, 'feminine'),
  formRow('xations', 11),
  lemmaRow('ysion', 2, 'masculine'),
  lemmaRow('zage', 3, 'masculine'),
  lemmaRow('wage', 4, 'feminine'),
  lemmaRow('ve', 5, 'feminine'),
  lemmaRow('zert\u00e9', 6, 'feminine'),
  lemmaRow('zerte\u0301', 7, 'feminine'), // NFD spelling of the previous row: collapses to one NFC lemma
  lemmaRow('invlemma', 8, 'invariable'),
  lemmaRow('dash-lemma', 9, 'feminine'),
  lemmaRow('space lemma', 10, 'masculine'),
  lemmaRow('Upperlemma', 11, 'feminine'),
  lemmaRow('locution-lemma', 12, 'feminine', 'locution'),
  lemmaRow('dashless', 13, '-'),
  ';;;;;;;;;"quo;ted";99;singular;-;-;-;-;;fixture-origin',
].join('\n');
const parse = (csv = CSV) => readCommonNounCsv(csv.split('\n'));

test('parses lemma rows, tracks the lemma across form rows and reads the version line', async () => {
  const { morphalouVersion, genders, skipped } = await parse();
  expect(morphalouVersion).toBe('Version de fixture-6/2016');
  expect([...genders.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
    ['ve', 'f'],
    ['wage', 'f'],
    ['xation', 'f'],
    ['ysion', 'm'],
    ['zage', 'm'],
    ['zerté', 'f'],
  ]);
  expect(skipped).toEqual({ invariable: 1, otherGenre: 1, notSingleWord: 4 });
});

test('skips invariable lemmas and non-single-word rows by bucket', async () => {
  const { genders, skipped } = await parse();
  expect(genders.has('invlemma')).toBe(false);
  expect(genders.has('dash-lemma')).toBe(false);
  expect(genders.has('space lemma')).toBe(false);
  expect(genders.has('Upperlemma')).toBe(false);
  expect(genders.has('locution-lemma')).toBe(false);
  // dash-lemma, space lemma, Upperlemma, locution-lemma; the quoted-form row is a form row, not a lemma
  expect(skipped.notSingleWord).toBe(4);
  expect(skipped.invariable).toBe(1);
  expect(skipped.otherGenre).toBe(1);
});

test('counts candidates independently, overlapping endings counted under each', async () => {
  const { genders } = await parse();
  expect(measureCandidate(genders, 'tion', 'f')).toEqual({ n: 1, agree: 1 });
  expect(measureCandidate(genders, 'sion', 'f')).toEqual({ n: 1, agree: 0 });
  // xation and ysion both end in -ion; both also counted under -tion/-sion above.
  expect(measureCandidate(genders, 'ion', 'f')).toEqual({ n: 2, agree: 1 });
  // zage and wage end in -age; zage, wage and ve also end in -e.
  expect(measureCandidate(genders, 'age', 'm')).toEqual({ n: 2, agree: 1 });
  expect(measureCandidate(genders, 'e', 'f')).toEqual({ n: 3, agree: 2 });
  // NFD lemmas are normalized to NFC before matching.
  expect(measureCandidate(genders, 'té', 'f')).toEqual({ n: 1, agree: 1 });
  expect(measureCandidate(genders, 'ée', 'f')).toEqual({ n: 0, agree: 0 });
});

test('header mismatches fail with the actual line', async () => {
  const failure = (csv: string) =>
    parse(csv).then(
      () => 'unexpected success',
      (error: Error) => error.message,
    );
  expect(await failure(CSV.replace('GRAPHIE;ID;', 'BROKEN;ID;'))).toContain('got BROKEN;ID;');
  expect(await failure(CSV.replace('LEMME;;;;;;;;;FLEXION;;;;;;;;', 'WRONG BLOCKS'))).toContain('got WRONG BLOCKS');
  expect(await failure('short file')).toContain('header missing');
  expect(await failure(CSV.replace('Version de fixture-6/2016', 'No version here'))).toContain('no Version line');
  expect(await failure(CSV + '\nbad;row')).toContain('expected 18 columns; got bad;row');
});

test('streams a CRLF file from disk like the real run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relire-noun-gender-fixture-'));
  try {
    await Bun.write(join(dir, 'commonNoun_Morphalou3.1_CSV.csv'), CSV.replace(/\n/g, '\r\n') + '\r\n');
    expect(await loadCommonNounCsv(dir)).toEqual(await parse());
  } finally {
    await rm(dir, { recursive: true });
  }
});

const ranAt = '2026-10-19T00:00:00.000Z';
const measurement = (): Measurement =>
  MeasurementSchema.parse({
    morphalouVersion: 'Version de fixture-6/2016',
    ranAt,
    counted: 6,
    skipped: { invariable: 1, otherGenre: 1, notSingleWord: 4 },
    rules: {
      tion: {
        ending: 'tion',
        gender: 'f',
        n: 1,
        agree: 1,
        morphalouVersion: 'Version de fixture-6/2016',
        ranAt,
        rowHash: rowHash({ id: 'tion', ending: 'tion', gender: 'f' }),
      },
    },
  });

test('attest merges the last measurement and keeps earlier records', () => {
  const previous = OracleAttestSchema.parse({ rules: {} });
  const next = attestMeasurement(previous, measurement());
  expect(next.rules.tion).toEqual(measurement().rules.tion);
  expect(previous).toEqual({ rules: {} });
  const again = attestMeasurement(
    next,
    MeasurementSchema.parse({ ...measurement(), rules: { ...measurement().rules, sion: measurement().rules.tion! } }),
  );
  expect(Object.keys(again.rules).sort()).toEqual(['sion', 'tion']);
});

test('nothing but integers, version, dates and hashes is written: schemas reject Morphalou strings', () => {
  const json = JSON.stringify(attestMeasurement({ rules: {} }, measurement()));
  for (const token of ['xation', 'ysion', 'zage', 'wage', 've', 'zerté', 'fixture-phon', 'fixture-origin']) {
    expect(json.includes(token)).toBe(false);
  }
  const leak = {
    ...measurement(),
    rules: { tion: { ...measurement().rules.tion!, lemmas: ['xation'] } },
  };
  expect(MeasurementSchema.safeParse(leak).success).toBe(false);
  expect(OracleAttestSchema.safeParse({ rules: { tion: leak.rules.tion } }).success).toBe(false);
});
