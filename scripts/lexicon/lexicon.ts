/** Owns turning Morphalou rows into lexicon entries and their form index; not SQL, files or the command line. */
import { join, resolve } from 'node:path';
import { FINITE_PERSONS, IMPERATIVE_PERSONS } from '../../src/types/grammarPack';
import { AGREEMENTS, LEXICON_TENSES } from '../../src/types/lexicon';
import { AGREEMENT, fileLines, MOOD_TENSE, morphalouRows, PERSON } from '../lib/morphalou-csv';

export type Pos = 'verb' | 'noun' | 'adjective';
export interface Entry {
  lemma: string;
  pos: Pos;
  genders: Set<string>;
  /** Forms by slot (`tenses.present.1sg`, `participles.past.ms`, `singular`, `ms`). */
  cells: Map<string, Set<string>>;
  /** Lookup keys of every attested form: the cells' forms plus the infinitive. */
  forms: Set<string>;
}
/** Keyed by `lemma\0pos`. */
export type Lexicon = Map<string, Entry>;

const TENSE_BY_TAG = new Map(LEXICON_TENSES.map((tense) => [MOOD_TENSE[tense], tense]));
// Same convention as the oracle: an `invariable` gender or number fills both slots.
const agreements = (gender: string, number: string) =>
  AGREEMENTS.filter(
    (a) => [gender, 'invariable'].includes(AGREEMENT[a][0]) && [number, 'invariable'].includes(AGREEMENT[a][1]),
  );

/** Adds one file's lemmas (only the `wanted` ids, `lemma\0pos`, when given). Skips capitalised lemmas (gentilés, abbreviations: lowercasing them would merge them into the common word) and multiword locutions. */
export async function collect(
  pos: Pos,
  lines: AsyncIterable<string> | Iterable<string>,
  lexicon: Lexicon,
  wanted?: ReadonlySet<string>,
) {
  for await (const { lemma: raw, cells: c, lemmaCells } of morphalouRows(lines)) {
    const lemma = raw.normalize('NFC');
    // Morphalou's LOCUTION column is empty in these files; a space in the lemma is what marks a locution.
    // A pronominal verb (`se blottir`) is a verb of its own, not a locution.
    if (lemma !== lemma.toLowerCase() || /\s/.test(pos === 'verb' ? lemma.replace(/^se /, '') : lemma)) continue;
    const id = `${lemma}\0${pos}`;
    if (wanted && !wanted.has(id)) continue;
    const form = c[9].normalize('NFC');
    if (/\s/.test(form)) continue; // some pronominal infinitives are listed as `se gominer`
    let entry = lexicon.get(id);
    if (!entry) lexicon.set(id, (entry = { lemma, pos, genders: new Set(), cells: new Map(), forms: new Set() }));
    if (pos === 'noun') entry.genders.add(lemmaCells[5]);
    const add = (...slots: string[]) => {
      for (const slot of slots) {
        let forms = entry.cells.get(slot);
        if (!forms) entry.cells.set(slot, (forms = new Set()));
        forms.add(form);
      }
      if (slots.length) entry.forms.add(form.toLowerCase());
    };
    if (pos === 'noun') {
      add(...(c[11] === 'invariable' ? ['singular', 'plural'] : [c[11]]));
    } else if (pos === 'adjective') {
      add(...agreements(c[13], c[11]));
    } else if (c[12] === 'infinitive') {
      entry.forms.add(form.toLowerCase());
    } else if (c[12] === 'participle') {
      if (c[14] === 'present') add('participles.present');
      else if (c[14] === 'past') add(...agreements(c[13], c[11]).map((a) => `participles.past.${a}`));
    } else {
      const tense = TENSE_BY_TAG.get(`${c[12]}:${c[14]}`);
      const person = `${PERSON.indexOf(c[15]) + 1}${c[11] === 'singular' ? 'sg' : 'pl'}`;
      if (tense && (tense === 'imperatif' ? IMPERATIVE_PERSONS : FINITE_PERSONS).some((p) => p === person)) {
        add(`tenses.${tense}.${person}`);
      }
    }
  }
}

/** The `data` JSON and the gender column of one entry, in one canonical order whatever the file order. */
export function entryRow({ pos, genders, cells }: Entry): { gender: string | null; data: string } {
  const slot = (key: string) => {
    const forms = cells.get(key);
    return forms && [...forms].sort();
  };
  const pick = <K extends string>(keys: readonly K[], prefix = '') => {
    const picked: Partial<Record<K, string[]>> = {};
    for (const key of keys) {
      const forms = slot(prefix + key);
      if (forms) picked[key] = forms;
    }
    return picked;
  };
  if (pos === 'noun') {
    return { gender: [...genders].sort().join(','), data: JSON.stringify(pick(['singular', 'plural'])) };
  }
  if (pos === 'adjective') return { gender: null, data: JSON.stringify(pick(AGREEMENTS)) };
  const tenses: Record<string, unknown> = {};
  for (const tense of LEXICON_TENSES) {
    const persons = pick(tense === 'imperatif' ? IMPERATIVE_PERSONS : FINITE_PERSONS, `tenses.${tense}.`);
    if (Object.keys(persons).length) tenses[tense] = persons;
  }
  const present = slot('participles.present');
  const participles = { ...(present && { present }), past: pick(AGREEMENTS, 'participles.past.') };
  return { gender: null, data: JSON.stringify({ tenses, participles }) };
}

export const SOURCES = [
  ['verb', 'verb_Morphalou3.1_CSV.csv'],
  ['noun', 'commonNoun_Morphalou3.1_CSV.csv'],
  ['adjective', 'adjective_Morphalou3.1_CSV.csv'],
] as const satisfies readonly (readonly [Pos, string])[];

/** The same convention as the grammar-pack oracle: `MORPHALOU_DIR`, else a copy under `.local/`. */
export const morphalouDir = (root: string, env: Record<string, string | undefined> = process.env) =>
  resolve(root, env.MORPHALOU_DIR ?? '.local/morphalou/csv/Morphalou3.1_formatCSV');

export async function loadLexicon(dir: string, wanted?: ReadonlySet<string>): Promise<Lexicon> {
  const lexicon: Lexicon = new Map();
  for (const [pos, file] of SOURCES) await collect(pos, fileLines(join(dir, file)), lexicon, wanted);
  return lexicon;
}

/** One `pos:lemma` per line, as `select.ts` writes it. Returns the `lemma\0pos` ids. */
export function parseAllowlist(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [, pos, lemma] = /^(verb|noun|adjective):(.+)$/.exec(line) ?? [];
      if (!pos) throw new Error(`Bad allowlist line: ${line}`);
      return `${lemma}\0${pos}`;
    });
}
