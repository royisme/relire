/** Owns the offline Morphalou CSV layout and cell mapping; not comparison, decisions or shipped forms. */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { SimpleTense } from '../../src/services/conjugation/generate';

export type OracleTense = SimpleTense | 'participlePresent' | 'participlePast';
export type MorphalouIndex = Map<string, Map<string, Set<string>>>;

const HEADER =
  'GRAPHIE;ID;CATÉGORIE;SOUS CATÉGORIE;LOCUTION;GENRE;AUTRES LEMMES LIÉS;PHONÉTIQUE;ORIGINES;GRAPHIE;ID;NOMBRE;MODE;GENRE;TEMPS;PERSONNE;PHONÉTIQUE;ORIGINES';
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
  let lineNumber = 0;
  let lemma = '';
  for await (const line of lines) {
    lineNumber++;
    if (lineNumber < 15) continue;
    if (lineNumber === 15 || lineNumber === 16) {
      const expected = lineNumber === 15 ? 'LEMME;;;;;;;;;FLEXION;;;;;;;;' : HEADER;
      if (line !== expected) throw new Error(`Morphalou line ${lineNumber}: expected ${expected}; got ${line}`);
      continue;
    }
    const c = line.split(';');
    if (c.length !== 18) throw new Error(`Morphalou line ${lineNumber}: expected 18 columns; got ${line}`);
    if (c[0]) lemma = c[0];
    if (!lemma) throw new Error(`Morphalou line ${lineNumber}: form without a lemma; got ${line}`);
    let cells = index.get(lemma);
    if (!cells) index.set(lemma, (cells = new Map()));
    const key =
      c[12] === 'participle' ? `participle:${c[14]}:${c[13]}:${c[11]}` : `${c[12]}:${c[14]}:${c[11]}:${c[15]}`;
    let forms = cells.get(key);
    if (!forms) cells.set(key, (forms = new Set()));
    forms.add(c[9]);
  }
  if (lineNumber < 16) throw new Error(`Morphalou header missing after line ${lineNumber}`);
  return index;
}

export async function loadMorphalou(dir: string): Promise<MorphalouIndex> {
  const input = createReadStream(join(dir, 'verb_Morphalou3.1_CSV.csv'), { encoding: 'utf8' });
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  });
  try {
    return await parseMorphalou(lines);
  } finally {
    lines.close();
    input.destroy();
  }
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
