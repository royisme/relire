/** Source-preserving word occurrences and grapheme indices, shared by AI and rendering. */
export interface ReaderWordToken {
  ordinal: number;
  text: string;
  start: number;
  end: number;
  lookup: string;
  prefix: string;
}

export interface ReaderTextToken {
  text: string;
  start: number;
  end: number;
  word?: ReaderWordToken;
}

export const hasGraphemeSupport = () => typeof Intl.Segmenter === 'function';

export function graphemes(text: string): string[] {
  if (!hasGraphemeSupport()) throw new Error('Intl.Segmenter unavailable');
  return Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(text), (s) => s.segment);
}

export const normalizeMarkerSource = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** No apostrophe normalization in the source. Only lookup removes a conventional elided prefix. */
export function readerTokens(source: string): ReaderTextToken[] {
  const pattern = /\p{L}[\p{L}\p{M}]*(?:['’‘`\-‐‑]\p{L}[\p{L}\p{M}]*)*/gu;
  const tokens: ReaderTextToken[] = [];
  let cursor = 0;
  let ordinal = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    const text = match[0];
    if (start > cursor) tokens.push({ text: source.slice(cursor, start), start: cursor, end: start });
    const prefix = text.match(/^(?:[ldcsnjmt]|qu)['’‘`]/i)?.[0] ?? '';
    const word = { ordinal: ordinal++, text, start, end: start + text.length, prefix, lookup: text.slice(prefix.length) };
    tokens.push({ text, start, end: word.end, word });
    cursor = word.end;
  }
  if (cursor < source.length) tokens.push({ text: source.slice(cursor), start: cursor, end: source.length });
  return tokens;
}

export const readerWords = (source: string): ReaderWordToken[] =>
  readerTokens(source).flatMap((token) => token.word ? [token.word] : []);

export function enumeratedReaderWords(source: string) {
  return readerWords(source).map(({ ordinal, text }) => ({ ordinal, source: text, graphemes: graphemes(text) }));
}
