/** Owns choosing which lemmas the lexicon serves: Lexique ranks them, Morphalou must have them. Offline, run by the owner; writes only words. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fileLines } from '../lib/morphalou-csv';
import { loadLexicon, morphalouDir, type Lexicon, type Pos } from './lexicon';

/** About what learners from A1 to B2 meet; raise or lower it and rerun. */
export const TOP_N = 5000;

const CGRAM: Record<string, Pos> = { VER: 'verb', NOM: 'noun', ADJ: 'adjective' };
const repository = new URL('../../', import.meta.url);

/**
 * `lemma\0pos` to score: the sum of the two lemma frequencies (films and books). Lexique repeats these
 * on every inflected row of a lemma, so the first row of each (lemma, category) gives the value.
 */
export async function scoreLemmas(lines: AsyncIterable<string> | Iterable<string>): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  let columns: { lemma: number; cgram: number; films: number; books: number } | undefined;
  for await (const line of lines) {
    const cells = line.split('\t');
    if (!columns) {
      const at = (name: string) => {
        const i = cells.indexOf(name);
        if (i < 0) throw new Error(`Lexique header has no column ${name}`);
        return i;
      };
      columns = { lemma: at('lemme'), cgram: at('cgram'), films: at('freqlemfilms2'), books: at('freqlemlivres') };
      continue;
    }
    const pos = CGRAM[cells[columns.cgram]];
    if (!pos) continue;
    const id = `${cells[columns.lemma].normalize('NFC')}\0${pos}`;
    if (!scores.has(id)) scores.set(id, Number(cells[columns.films]) + Number(cells[columns.books]));
  }
  return scores;
}

/** The top `topN` scored ids that Morphalou has, plus every forced id that Morphalou has; the rest of `forced` is returned as missing. */
export function selectLemmas(scores: Map<string, number>, lexicon: Lexicon, forced: string[], topN = TOP_N) {
  const ranked = [...scores]
    .filter(([id]) => lexicon.has(id))
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
    .map(([id]) => id);
  const chosen = new Set(ranked.slice(0, topN));
  const missing = forced.filter((id) => !lexicon.has(id));
  for (const id of forced) if (lexicon.has(id)) chosen.add(id);
  const lines = [...chosen].map((id) => id.split('\0').reverse().join(':')).sort();
  return { lines, ranked, missing };
}

/** The pack's verbs (infinitive, curly apostrophe folded) and the noun-gender nouns: what the app already teaches. */
export async function forcedIds(root: URL): Promise<string[]> {
  const pack = (await Bun.file(new URL('src/data/grammar-pack/pack.json', root)).json()) as {
    verbs: { infinitive: string }[];
  };
  const nouns = (await Bun.file(new URL('data/noun-gender/nouns.json', root)).json()) as { nouns: { lemma: string }[] };
  return [
    ...pack.verbs.map((verb) => `${verb.infinitive.normalize('NFC').replace(/’/g, "'")}\0verb`),
    ...nouns.nouns.map((noun) => `${noun.lemma.normalize('NFC')}\0noun`),
  ];
}

if (import.meta.main) {
  const lexique = resolve(fileURLToPath(repository), process.env.LEXIQUE_FILE ?? '.local/lexique/Lexique383.tsv');
  const [scores, lexicon, forced] = await Promise.all([
    scoreLemmas(fileLines(lexique)),
    loadLexicon(morphalouDir(fileURLToPath(repository))),
    forcedIds(repository),
  ]);
  const { lines, missing } = selectLemmas(scores, lexicon, forced);
  const output = new URL('data/lexicon/lemmas.txt', repository);
  await Bun.write(output, lines.join('\n') + '\n');
  const count = (pos: Pos) => lines.filter((line) => line.startsWith(`${pos}:`)).length;
  console.log(
    `${lines.length} lemmas: ${count('verb')} verbs, ${count('noun')} nouns, ${count('adjective')} adjectives`,
  );
  console.log(
    `forced ${forced.length - missing.length} of ${forced.length}; not in Morphalou: ${missing.map((id) => id.split('\0').join(' ')).join(', ') || 'none'}`,
  );
}
