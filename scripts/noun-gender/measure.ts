/**
 * Owns the offline Morphalou commonNoun measurement: the CSV adapter (preamble,
 * block header, quoted fields, lemma rows), single-word gendered-lemma counting
 * per candidate ending, the stdout table, the ignored .local measurement file
 * and the attest subcommand. Nothing from Morphalou but integer counts and the
 * version line is ever written; no pack data (build.ts) or review decisions.
 */
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Gender } from '../../src/types/nounGender';
import { CandidatesSchema, OracleAttestSchema, OracleAttestRuleSchema, rowHash, type OracleAttest } from './build';

const NOUN_FILE = 'commonNoun_Morphalou3.1_CSV.csv';
const BLOCK_HEADER = 'LEMME;;;;;;;;;FLEXION;;;;;;;;';
const HEADER =
  'GRAPHIE;ID;CATÉGORIE;SOUS CATÉGORIE;LOCUTION;GENRE;AUTRES LEMMES LIÉS;PHONÉTIQUE;ORIGINES;GRAPHIE;ID;NOMBRE;MODE;GENRE;TEMPS;PERSONNE;PHONÉTIQUE;ORIGINES';

export interface SkippedCounts {
  invariable: number;
  otherGenre: number;
  notSingleWord: number;
}
export interface NounGenderIndex {
  morphalouVersion: string;
  /** Single-word masculine/feminine lemmas by NFC lemma; duplicate NFC spellings collapse. */
  genders: Map<string, Gender>;
  skipped: SkippedCounts;
}

/** Quote-aware split: quoted fields may contain semicolons (one such line exists in the real file). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      fields.push(field);
      field = '';
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

export async function readCommonNounCsv(lines: Iterable<string> | AsyncIterable<string>): Promise<NounGenderIndex> {
  const genders = new Map<string, Gender>();
  const skipped: SkippedCounts = { invariable: 0, otherGenre: 0, notSingleWord: 0 };
  let morphalouVersion = '';
  let lineNo = 0;
  for await (const line of lines) {
    lineNo++;
    if (lineNo < 15) {
      if (line.startsWith('Version')) morphalouVersion = line.trim();
      continue;
    }
    if (lineNo === 15 || lineNo === 16) {
      const expected = lineNo === 15 ? BLOCK_HEADER : HEADER;
      if (line !== expected) throw new Error(`Morphalou line ${lineNo}: expected ${expected}; got ${line}`);
      continue;
    }
    const c = splitCsvLine(line);
    if (c.length !== 18) throw new Error(`Morphalou line ${lineNo}: expected 18 columns; got ${line}`);
    if (!c[0]) continue; // form row: the lemma is tracked from its lemma row
    const singleWord = c[4] === '' && !/[ -]/.test(c[0]) && c[0] === c[0].toLowerCase();
    if (!singleWord) skipped.notSingleWord++;
    else if (c[5] === 'invariable') skipped.invariable++;
    else if (c[5] !== 'masculine' && c[5] !== 'feminine') skipped.otherGenre++;
    else genders.set(c[0].normalize('NFC'), c[5] === 'masculine' ? 'm' : 'f');
  }
  if (lineNo < 16) throw new Error(`Morphalou header missing after line ${lineNo}`);
  if (!morphalouVersion) throw new Error('Morphalou preamble has no Version line');
  return { morphalouVersion, genders, skipped };
}

export async function loadCommonNounCsv(dir: string): Promise<NounGenderIndex> {
  const input = createReadStream(join(dir, NOUN_FILE), { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    return await readCommonNounCsv(lines);
  } finally {
    lines.close();
    input.destroy();
  }
}

export function measureCandidate(genders: NounGenderIndex['genders'], ending: string, gender: Gender) {
  let n = 0;
  let agree = 0;
  for (const [lemma, lemmaGender] of genders) {
    if (lemma.endsWith(ending)) {
      n++;
      if (lemmaGender === gender) agree++;
    }
  }
  return { n, agree };
}

/** The ignored .local file; `rules` entries are exactly the attest records. */
export const MeasurementSchema = z.strictObject({
  morphalouVersion: z.string().trim().min(1),
  ranAt: z.iso.datetime(),
  counted: z.number().int().nonnegative(),
  skipped: z.strictObject({
    invariable: z.number().int().nonnegative(),
    otherGenre: z.number().int().nonnegative(),
    notSingleWord: z.number().int().nonnegative(),
  }),
  rules: z.record(z.string(), OracleAttestRuleSchema),
});
export type Measurement = z.infer<typeof MeasurementSchema>;

/** Merges the last measurement into the attest for the candidates it measured. */
export function attestMeasurement(attest: OracleAttest, measurement: Measurement): OracleAttest {
  return OracleAttestSchema.parse({ rules: { ...attest.rules, ...measurement.rules } });
}

const MEASUREMENT_PATH = resolve(fileURLToPath(new URL('../../', import.meta.url)), '.local/noun-gender');

if (import.meta.main) {
  const [command] = Bun.argv.slice(2);
  if (command && command !== 'attest') throw new Error('Usage: measure.ts [attest]');
  if (command === 'attest') {
    const file = Bun.file(join(MEASUREMENT_PATH, 'measurement.json'));
    if (!(await file.exists())) throw new Error('no measurement found; run measure.ts first');
    const measurement = MeasurementSchema.parse(await file.json());
    const attestPath = new URL('../../data/noun-gender/oracle-attest.json', import.meta.url);
    const next = attestMeasurement(OracleAttestSchema.parse(await Bun.file(attestPath).json()), measurement);
    await Bun.write(attestPath, JSON.stringify(next, null, 2) + '\n');
    for (const id of Object.keys(measurement.rules)) console.log(`${id}: attested`);
  } else {
    const candidates = CandidatesSchema.parse(
      await Bun.file(new URL('../../data/noun-gender/candidates.json', import.meta.url)).json(),
    );
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const dir = resolve(root, process.env.MORPHALOU_DIR ?? '.local/morphalou/csv/Morphalou3.1_formatCSV');
    const { morphalouVersion, genders, skipped } = await loadCommonNounCsv(dir);
    const ranAt = new Date().toISOString();
    const rules: Measurement['rules'] = {};
    for (const candidate of candidates) {
      const { n, agree } = measureCandidate(genders, candidate.ending, candidate.gender);
      rules[candidate.id] = {
        ending: candidate.ending,
        gender: candidate.gender,
        n,
        agree,
        morphalouVersion,
        ranAt,
        rowHash: rowHash(candidate),
      };
    }
    console.log(`Morphalou: ${morphalouVersion}`);
    console.log(
      `counted ${genders.size} single-word gendered lemmas (unique after NFC); skipped ` +
        `${skipped.invariable} invariable, ${skipped.otherGenre} with another GENRE value, ` +
        `${skipped.notSingleWord} not single-word (locution, space, hyphen or capital)`,
    );
    const width = Math.max(...candidates.map(({ ending }) => ending.length));
    console.log(`\nending ${' '.repeat(Math.max(0, width - 6))}gender       n    agree  share`);
    for (const candidate of candidates) {
      const { n, agree } = rules[candidate.id]!;
      const share = n === 0 ? '-' : `${((100 * agree) / n).toFixed(2)}%`;
      console.log(
        `-${candidate.ending.padEnd(width + 1)}${candidate.gender}  ${String(n).padStart(8)}  ${String(agree).padStart(7)}  ${share.padStart(6)}`,
      );
    }
    const measurement: Measurement = {
      morphalouVersion,
      ranAt,
      counted: genders.size,
      skipped,
      rules,
    };
    await mkdir(MEASUREMENT_PATH, { recursive: true });
    await Bun.write(join(MEASUREMENT_PATH, 'measurement.json'), JSON.stringify(measurement, null, 2) + '\n');
  }
}
