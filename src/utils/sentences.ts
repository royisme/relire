/**
 * How an article is cut into paragraphs and sentences. The reader renders these pieces and the listener
 * plays them, so both must use the same cut; ids are `${paragraph}-${sentence}`.
 */

export interface SentencePiece {
  id: string;
  /** As written, including surrounding spaces (the reader keeps them). */
  raw: string;
  /** Trimmed, for lookups and speech. */
  text: string;
}

// A sentence ends at . ! ? or :; text after the last mark (a paragraph without final punctuation) is kept too.
const SENTENCE = /[^.!?:]+[.!?:]+|[^.!?:]+$/g;

export function splitArticle(content: string): SentencePiece[][] {
  return content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, pIdx) =>
      joinStrays(p.match(SENTENCE) || [p]).map((raw, sIdx) => ({ id: `${pIdx}-${sIdx}`, raw, text: raw.trim() }))
    );
}

// Closing quotes or brackets after the end mark ("... »") belong to the sentence they close, and a piece
// left with no letter or digit is merged into the sentence before it.
function joinStrays(pieces: string[]): string[] {
  const out: string[] = [];
  for (let raw of pieces) {
    if (out.length) {
      const closers = raw.match(/^\s*[»”’")\]]+/)?.[0];
      if (closers) {
        out[out.length - 1] += closers;
        raw = raw.slice(closers.length);
      }
    }
    if (!raw.trim()) continue;
    if (out.length && !/[\p{L}\p{N}]/u.test(raw)) out[out.length - 1] += raw;
    else out.push(raw);
  }
  return out;
}
