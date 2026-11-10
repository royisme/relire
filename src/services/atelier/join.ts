/**
 * The atelier join rule and its comparison helpers: how bricks become the one
 * French string the app stores and grades, and how sentences split into
 * comparable tokens. Pure; no exercise contracts, grading or storage.
 */
import type { BrickRole } from '../../types/atelier';

/** Every apostrophe becomes the typographic one, so a join and the AI text never differ on the character alone. */
const withTypographicApostrophe = (text: string): string => text.replaceAll("'", '’');

/** The comparable form of a sentence: one apostrophe character, single spaces, trimmed. */
export const normalizeSentence = (text: string): string => withTypographicApostrophe(text).replace(/\s+/g, ' ').trim();

/**
 * The one rule that turns bricks into the French string: bricks are joined
 * with a single space, except that no space follows a brick ending in an
 * apostrophe (`j’` + `aime` gives `j’aime`) and none precedes a punctuation
 * brick (`plage` + `.` gives `plage.`). Nothing else changes — no
 * capitalisation, no no-break space — so the result is exactly what
 * `normalizeFrench` in services/exercises compares.
 */
export function joinBricks(bricks: readonly { text: string; role: BrickRole }[]): string {
  let joined = '';
  for (const brick of bricks) {
    const text = withTypographicApostrophe(brick.text);
    if (!joined || brick.role === 'punctuation' || joined.endsWith('’')) joined += text;
    else joined += ` ${text}`;
  }
  return joined;
}

/** A word keeps a trailing elision (`j’aime` splits as `j’` + `aime`); accents stay; every lone symbol is a token. */
const TOKEN = /[\p{L}\p{N}]+’?|[^\s\p{L}\p{N}]/gu;

/** Comparable tokens of a sentence: lowercase, one apostrophe character, then every TOKEN match. */
export function tokensOf(text: string): string[] {
  return withTypographicApostrophe(text).toLowerCase().match(TOKEN) ?? [];
}
