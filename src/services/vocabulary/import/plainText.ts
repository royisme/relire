/** Local Anki/CSV boundary: quote-aware records retain physical source line numbers, including refused records. */
import { ImportRefusal, type ImportReason } from './refusal';

export const MAX_TEXT_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_ROWS = 20_000;

export async function readPlainTextFile(file: Pick<File, 'size' | 'text'>): Promise<PlainTextImport> {
  if (file.size > MAX_TEXT_BYTES)
    throw new ImportRefusal({
      key: 'vocab.import.errors.textTooLarge',
      params: { size: MAX_TEXT_BYTES / 1024 / 1024 },
    });
  return parsePlainText(await file.text());
}

export const SEPARATORS = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|' } as const;
export type Separator = keyof typeof SEPARATORS;
export interface ImportRow {
  row: number;
  fields: string[];
  error?: ImportReason;
}
export interface ImportHeaders {
  html?: boolean;
  guidColumn?: number;
  notetypeColumn?: number;
  deckColumn?: number;
  tagsColumn?: number;
  columns?: string[];
}
export interface PlainTextImport {
  separator: Separator;
  headers: ImportHeaders;
  rows: ImportRow[];
}

export function parsePlainText(input: string): PlainTextImport {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const headers: ImportHeaders = {};
  let start = 0;
  let declared: Separator | undefined;
  let columnNames: string | undefined;
  while (start < lines.length && (lines[start].startsWith('#') || !lines[start].trim())) {
    const line = lines[start++];
    const separator = /^#separator:(.*)$/i.exec(line);
    if (separator) {
      const name = separator[1].trim().toLowerCase();
      if (!Object.hasOwn(SEPARATORS, name))
        throw new ImportRefusal({ key: 'vocab.import.errors.separator', params: { name } });
      declared = name as Separator;
    }
    const html = /^#html:(true|false)$/i.exec(line);
    if (html) headers.html = html[1].toLowerCase() === 'true';
    const column = /^#(guid|notetype|deck|tags) column:(.*)$/i.exec(line);
    if (column) {
      const value = Number(column[2]);
      if (!Number.isInteger(value) || value < 1)
        throw new ImportRefusal({ key: 'vocab.import.errors.columnHeader', params: { line } });
      const key = `${column[1].toLowerCase()}Column` as 'guidColumn' | 'notetypeColumn' | 'deckColumn' | 'tagsColumn';
      headers[key] = value - 1;
    }
    if (/^#columns:/i.test(line)) columnNames = line.slice('#columns:'.length);
  }
  const body = lines.slice(start).join('\n');
  // Inspect only the first logical record, not delimiters inside quoted fields.
  let hasTab = false;
  let firstDelimiter: 'semicolon' | 'comma' | undefined;
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '"') {
      if (quoted && body[i + 1] === '"') {
        i += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (quoted) continue;
    if (body[i] === '\n') break;
    const entity = body[i] === '&' ? /^&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/i.exec(body.slice(i)) : null;
    if (entity) {
      i += entity[0].length - 1;
      continue;
    }
    if (body[i] === '\t') hasTab = true;
    if (body[i] === ';' && !firstDelimiter) firstDelimiter = 'semicolon';
    if (body[i] === ',' && !firstDelimiter) firstDelimiter = 'comma';
  }
  const separator = declared ?? (hasTab ? 'tab' : (firstDelimiter ?? 'comma'));
  if (columnNames !== undefined) headers.columns = records(columnNames, SEPARATORS[separator], 1)[0]?.fields ?? [];
  return { separator, headers, rows: records(body, SEPARATORS[separator], start + 1) };
}

function records(text: string, separator: string, firstLine: number): ImportRow[] {
  const rows: ImportRow[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  let error: ImportReason | undefined;
  let line = firstLine;
  let row = firstLine;
  for (let i = 0; i <= text.length; i += 1) {
    const char = text[i];
    if (!quoted && !closed && !fields.length && !field && char === '#') {
      const end = text.indexOf('\n', i);
      if (end < 0) break;
      i = end;
      line += 1;
      row = line;
      continue;
    }
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        quoted = false;
        closed = true;
        continue;
      }
      if (char !== undefined) {
        field += char;
        if (char === '\n') line += 1;
        continue;
      }
      error = { key: 'vocab.import.errors.unclosedQuote' };
      quoted = false;
    }
    if (char === undefined || char === '\n' || char === separator) {
      fields.push(field);
      field = '';
      const explicitlyEmpty = closed;
      closed = false;
      if (char === separator) continue;
      if (fields.length > 1 || fields[0].trim() || explicitlyEmpty || error) {
        if (rows.length === MAX_TEXT_ROWS)
          throw new ImportRefusal({ key: 'vocab.import.errors.tooManyRows', params: { rows: MAX_TEXT_ROWS } });
        rows.push({ row, fields, ...(error ? { error } : {}) });
      }
      fields = [];
      error = undefined;
      line += 1;
      row = line;
      continue;
    }
    if (char === '"' && !field && !closed) {
      quoted = true;
      continue;
    }
    if (char === '"' || closed) error = { key: 'vocab.import.errors.unexpectedQuote' };
    field += char;
  }
  return rows;
}
