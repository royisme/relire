/** Owns the Morphalou 3.1 CSV row layout (preamble, headers, 18 columns, lemma carry-forward); not what any column means to a caller. */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const HEADER =
  'GRAPHIE;ID;CATÉGORIE;SOUS CATÉGORIE;LOCUTION;GENRE;AUTRES LEMMES LIÉS;PHONÉTIQUE;ORIGINES;GRAPHIE;ID;NOMBRE;MODE;GENRE;TEMPS;PERSONNE;PHONÉTIQUE;ORIGINES';

export interface MorphalouRow {
  lemma: string;
  /** The 18 cells of this line; the form is `cells[9]`. */
  cells: string[];
  /** The 18 cells of the first line of this lemma's block, where the lemma columns 0 to 8 are filled. */
  lemmaCells: string[];
}

/** Yields one form row at a time; the lemma columns are only filled on a block's first line, so they are carried forward. */
export async function* morphalouRows(
  lines: Iterable<string> | AsyncIterable<string>,
): AsyncGenerator<MorphalouRow, void, undefined> {
  let lineNumber = 0;
  let lemma = '';
  let lemmaCells: string[] = [];
  for await (const line of lines) {
    lineNumber++;
    if (lineNumber < 15) continue;
    if (lineNumber === 15 || lineNumber === 16) {
      const expected = lineNumber === 15 ? 'LEMME;;;;;;;;;FLEXION;;;;;;;;' : HEADER;
      if (line !== expected) throw new Error(`Morphalou line ${lineNumber}: expected ${expected}; got ${line}`);
      continue;
    }
    // The one `&amp;` in the file (a multiword noun) is an HTML entity whose `;` would add a column.
    const cells = line.replaceAll('&amp;', '&').split(';');
    if (cells.length !== 18) throw new Error(`Morphalou line ${lineNumber}: expected 18 columns; got ${line}`);
    if (cells[0]) {
      lemma = cells[0];
      lemmaCells = cells;
    }
    if (!lemma) throw new Error(`Morphalou line ${lineNumber}: form without a lemma; got ${line}`);
    yield { lemma, cells, lemmaCells };
  }
  if (lineNumber < 16) throw new Error(`Morphalou header missing after line ${lineNumber}`);
}

/** Streams a CSV file as lines (CRLF-safe) so a 70 MB file never sits in one string. */
export async function* fileLines(path: string): AsyncGenerator<string, void, undefined> {
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    yield* lines;
  } finally {
    lines.close();
    input.destroy();
  }
}
