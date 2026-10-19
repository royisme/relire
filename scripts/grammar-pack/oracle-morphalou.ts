/** Owns the oracle's mapping from Morphalou cells to tense keys (the CSV row layout is scripts/lib/morphalou-csv.ts); not comparison, decisions or shipped forms. */
import { join } from 'node:path';
import type { SimpleTense } from '../../src/services/conjugation/generate';
import { fileLines, morphalouRows } from '../lib/morphalou-csv';

export type OracleTense = SimpleTense | 'participlePresent' | 'participlePast';
export type MorphalouIndex = Map<string, Map<string, Set<string>>>;

const MOOD_TENSE: Record<SimpleTense, string> = {
  present: 'indicative:present',
  imparfait: 'indicative:imperfect',
  futur: 'indicative:future',
  conditionnel: 'conditional:present',
  subjonctif: 'subjunctive:present',
  imperatif: 'imperative:present',
};
const PERSON = ['firstPerson', 'secondPerson', 'thirdPerson'];
const AGREEMENT: Record<string, [string, string]> = {
  ms: ['masculine', 'singular'],
  fs: ['feminine', 'singular'],
  mp: ['masculine', 'plural'],
  fp: ['feminine', 'plural'],
};

export async function parseMorphalou(lines: Iterable<string> | AsyncIterable<string>): Promise<MorphalouIndex> {
  const index: MorphalouIndex = new Map();
  for await (const { lemma, cells: c } of morphalouRows(lines)) {
    let cells = index.get(lemma);
    if (!cells) index.set(lemma, (cells = new Map()));
    const key =
      c[12] === 'participle' ? `participle:${c[14]}:${c[13]}:${c[11]}` : `${c[12]}:${c[14]}:${c[11]}:${c[15]}`;
    let forms = cells.get(key);
    if (!forms) cells.set(key, (forms = new Set()));
    forms.add(c[9]);
  }
  return index;
}

export async function loadMorphalou(dir: string): Promise<MorphalouIndex> {
  return parseMorphalou(fileLines(join(dir, 'verb_Morphalou3.1_CSV.csv')));
}

export function morphalouForms(
  index: MorphalouIndex,
  infinitive: string,
  tense: OracleTense,
  person: string,
): string[] {
  const lemma = infinitive
    .normalize('NFC')
    .replace(/’/g, "'")
    .replace(/^(se |s')/, '');
  const cells = index.get(lemma);
  if (!cells) return [];
  if (tense === 'participlePast') {
    const [gender, number] = AGREEMENT[person];
    return [
      ...new Set(
        [gender, 'invariable'].flatMap((g) =>
          [number, 'invariable'].flatMap((n) => [...(cells.get(`participle:past:${g}:${n}`) ?? [])]),
        ),
      ),
    ].sort();
  }
  if (tense === 'participlePresent') {
    return [
      ...new Set(
        [...cells].filter(([key]) => key.startsWith('participle:present:')).flatMap(([, forms]) => [...forms]),
      ),
    ].sort();
  }
  const number = person.endsWith('sg') ? 'singular' : 'plural';
  const key = `${MOOD_TENSE[tense]}:${number}:${PERSON[Number(person[0]) - 1]}`;
  return [...(cells.get(key) ?? [])].sort();
}
