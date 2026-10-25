/** Normalize before the stored contracts validate; preparation never writes or silently discards a refused note. */
import { VocabularyContextSchema, type VocabularyRow } from '../../../types/vocabulary';
import { vocabularyContextKey } from '../identity';
import type { PlainTextImport } from './plainText';
import entities from './entities.json';

export interface ImportColumns {
  front: number;
  back: number;
  example: number | null;
}
export interface ImportedNote {
  word: string;
  context: VocabularyRow['contexts'][number];
}
export interface RejectedNote {
  row: number;
  reason: string;
}
export interface PreparedImport {
  notes: ImportedNote[];
  rejected: RejectedNote[];
}

// Generated from the standard-library HTML5 entity table; keep decoding pure in browsers and Bun alike.
const namedEntities: Readonly<Record<string, string>> = entities;

export function normalizeImportText(value: string): string {
  const plain = value
    .replace(/<!--[\s\S]*?-->|<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => (/^<br\b/i.test(tag) ? ' ' : ''))
    .replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity: string, name: string) => {
      if (!name.startsWith('#')) {
        if (Object.hasOwn(namedEntities, name)) return namedEntities[name];
        throw new Error(`Unsupported HTML entity: ${entity}`);
      }
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
        throw new Error(`Invalid HTML entity: ${entity}`);
      return String.fromCodePoint(code);
    })
    .replace(/\[sound:[^\]]*\]/gi, '')
    .replace(/'/g, '’')
    .normalize('NFC')
    .trim();
  // oxlint-disable-next-line no-control-regex -- Imported files may contain non-text control bytes.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(plain))
    throw new Error('Text contains a control character');
  return plain;
}

export function defaultImportColumns(parsed: PlainTextImport): ImportColumns {
  const metadata = [
    parsed.headers.guidColumn,
    parsed.headers.notetypeColumn,
    parsed.headers.deckColumn,
    parsed.headers.tagsColumn,
  ];
  const columns = Array.from(
    { length: parsed.rows.reduce((width, row) => Math.max(width, row.fields.length), 0) },
    (_, i) => i,
  ).filter((index) => !metadata.includes(index));
  return { front: columns[0] ?? 0, back: columns[1] ?? 1, example: null };
}

export function prepareVocabularyImport(
  parsed: PlainTextImport,
  columns: ImportColumns,
  fallbackDeck: string,
  requestLanguage: 'en' | 'zh',
  now: number,
): PreparedImport {
  const notes: ImportedNote[] = [];
  const rejected: RejectedNote[] = [];
  for (const row of parsed.rows) {
    try {
      if (row.error) throw new Error(row.error);
      if (columns.front === columns.back || columns.example === columns.front || columns.example === columns.back)
        throw new Error('Choose different columns for the word, answer and example');
      const read = (column: number) => {
        if (row.fields[column] === undefined) throw new Error(`Missing column ${column + 1}`);
        return normalizeImportText(row.fields[column]);
      };
      const deck =
        parsed.headers.deckColumn === undefined ? normalizeImportText(fallbackDeck) : read(parsed.headers.deckColumn);
      const noteId = parsed.headers.guidColumn === undefined ? String(row.row) : read(parsed.headers.guidColumn);
      const front = read(columns.front);
      const back = read(columns.back);
      const example = columns.example === null ? undefined : read(columns.example);
      const source = { kind: 'import' as const, id: deck, title: deck, noteId };
      const context = VocabularyContextSchema.safeParse({
        id: vocabularyContextKey({ source, sentence: example ?? '', requestLanguage }),
        source,
        sentence: example ?? '',
        requestLanguage,
        savedAt: now,
        definition: {
          kind: 'imported',
          front,
          back,
          ...(example !== undefined ? { example } : {}),
          tags:
            parsed.headers.tagsColumn === undefined
              ? []
              : [...new Set(read(parsed.headers.tagsColumn).split(/\s+/).filter(Boolean))],
        },
      });
      if (!context.success) {
        rejected.push({
          row: row.row,
          reason: context.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        });
        continue;
      }
      notes.push({ word: front, context: context.data });
    } catch (error) {
      rejected.push({ row: row.row, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { notes, rejected };
}
