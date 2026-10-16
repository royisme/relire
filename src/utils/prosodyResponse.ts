/**
 * Turns the model's spelling-based answer into the index-based marker record,
 * then hands it to the validator. Owns the wire format only; every rule about
 * what a valid marker is stays in `pronunciationMarkers.ts`.
 */
import type { GraphemeRange } from '../types/pronunciation';
import { MAX_PRONUNCIATION_SOURCE } from '../types/pronunciation';
import { FUNCTION_WORDS } from './functionWords';
import { PronunciationValidationError, validatePronunciationMarkers } from './pronunciationMarkers';
import { graphemes, normalizeMarkerSource, readerWords } from './readerTokens';

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new PronunciationValidationError(code);
}

function record(value: unknown, fields: string[]): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'object');
  const obj = value as Record<string, unknown>;
  check(Object.keys(obj).length === fields.length && fields.every((key) => Object.hasOwn(obj, key)), 'fields');
  return obj;
}

const plain = (value: unknown, max: number): string => {
  check(typeof value === 'string' && value.length <= max, 'text');
  return value;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

interface Segmented {
  ipa: string[];
  boundaries: number[];
  silent: GraphemeRange[];
}

/**
 * "tem(ps)" + "ps" → letters and the silent range, checked letter by letter
 * against the word. Throws for this word only; the caller leaves it unresolved.
 */
function segment(syllables: { spelling: string; ipa: string }[], parts: string[]): Segmented {
  check(syllables.length > 0 && syllables.length <= parts.length, 'syllables');
  const ipa: string[] = [];
  const boundaries: number[] = [];
  const silent: GraphemeRange[] = [];
  let position = 0;
  for (const syllable of syllables) {
    let inside = false;
    const start = position;
    for (const part of graphemes(syllable.spelling)) {
      if (part === '(' || part === ')') {
        check(inside === (part === ')'), 'silent-brackets');
        inside = !inside;
        continue;
      }
      check(position < parts.length && same(part, parts[position]), 'spelling');
      const last = silent.at(-1);
      if (inside && last?.end === position) last.end++;
      else if (inside) silent.push({ start: position, end: position + 1 });
      position++;
    }
    check(!inside && position > start, 'silent-brackets');
    ipa.push(syllable.ipa);
    boundaries.push(position);
  }
  check(position === parts.length, 'spelling');
  boundaries.pop();
  return { ipa, boundaries, silent };
}

/** Same shape as the provider's: a curated entry replaces it for exact frequent words. */
const lexicon = (word: string) => FUNCTION_WORDS[word.toLowerCase()]?.map(({ spelling, ipa }) => ({ spelling, ipa }));

/** Finds the left word's pronounced consonant spelling, nearest the word end. */
function lastOccurrence(parts: string[], spelling: string): GraphemeRange | null {
  const needle = graphemes(spelling);
  if (!needle.length) return null;
  for (let start = parts.length - needle.length; start >= 0; start--) {
    if (needle.every((part, offset) => same(part, parts[start + offset]))) return { start, end: start + needle.length };
  }
  return null;
}

export function parseProsodyResponse(value: unknown, source: string) {
  check(source.length <= MAX_PRONUNCIATION_SOURCE, 'oversize');
  const tokens = readerWords(source);
  const parts = tokens.map((token) => graphemes(token.text));
  const obj = record(value, ['words', 'connections']);
  check(Array.isArray(obj.words) && obj.words.length === tokens.length, 'word-count');
  check(Array.isArray(obj.connections), 'array:connections');

  const groupEnds = new Set<number>();
  const words = obj.words.map((entry) => {
    const word = record(entry, ['ordinal', 'source', 'status', 'syllables', 'groupEnd']);
    const ordinal = word.ordinal;
    check(typeof ordinal === 'number' && Number.isInteger(ordinal) && ordinal >= 0 && ordinal < tokens.length, 'index');
    const written = plain(word.source, MAX_PRONUNCIATION_SOURCE);
    check(normalizeMarkerSource(written) === normalizeMarkerSource(tokens[ordinal].text), 'word-source');
    check(word.status === 'resolved' || word.status === 'unresolved', 'status');
    check(typeof word.groupEnd === 'boolean' && Array.isArray(word.syllables), 'fields');
    const base = { ordinal, source: tokens[ordinal].text };
    const fromModel =
      word.status === 'resolved'
        ? word.syllables.map((item) => {
            const syllable = record(item, ['spelling', 'ipa']);
            return { spelling: plain(syllable.spelling, MAX_PRONUNCIATION_SOURCE + 64), ipa: plain(syllable.ipa, 120) };
          })
        : null;
    const syllables = lexicon(tokens[ordinal].text) ?? fromModel;
    if (!syllables) return { ...base, status: 'unresolved', ipa: [], boundaries: [], silent: [] };
    try {
      const segmented = segment(syllables, parts[ordinal]);
      if (word.groupEnd) groupEnds.add(ordinal);
      return { ...base, status: 'resolved', ...segmented };
    } catch (error) {
      if (!(error instanceof PronunciationValidationError)) throw error;
      return { ...base, status: 'unresolved', ipa: [], boundaries: [], silent: [] };
    }
  });

  // French stress falls on the last syllable of a rhythm group; the model
  // only says where groups end. The validator trims the anchor to audible letters.
  const stress = words
    .filter((word) => groupEnds.has(word.ordinal))
    .map((word) => ({
      word: word.ordinal,
      syllable: word.ipa.length - 1,
      anchor: { start: word.boundaries.at(-1) ?? 0, end: parts[word.ordinal].length },
    }));

  const linked = new Set<number>();
  const connections = obj.connections.flatMap((entry) => {
    const conn = record(entry, ['left', 'type', 'sound', 'spelling']);
    const left = conn.left;
    const spelling = plain(conn.spelling, 40);
    // A link the sentence cannot hold is dropped alone, like the validator's own link checks.
    if (
      typeof left !== 'number' ||
      !Number.isInteger(left) ||
      left < 0 ||
      left >= tokens.length - 1 ||
      linked.has(left)
    )
      return [];
    // A consonant the left word does not contain cannot be the realized one.
    const pronounced = lastOccurrence(parts[left], spelling);
    if (!pronounced) return [];
    linked.add(left);
    return [{ left, right: left + 1, type: conn.type, sound: conn.sound, pronounced }];
  });

  return validatePronunciationMarkers({ version: 1, source, words, connections, stress }, source);
}
