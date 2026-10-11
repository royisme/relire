/** Runtime trust boundary for model/cache output; does not certify phonetic accuracy. */
import i18n from '../i18n';
import type { GraphemeRange, PronunciationConnection, PronunciationMarkers, PronunciationStress, PronunciationWord } from '../types/pronunciation';
import { MAX_PRONUNCIATION_SOURCE } from '../types/pronunciation';
import { graphemes, normalizeMarkerSource, readerWords } from './readerTokens';

export class PronunciationValidationError extends Error {
  constructor(readonly code: string) {
    super(i18n.t('prosody.invalidResponse', { code }));
    this.name = 'PronunciationValidationError';
  }
}

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new PronunciationValidationError(code);
}

function record(value: unknown, fields: string[]): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'object');
  const obj = value as Record<string, unknown>;
  check(Object.keys(obj).length === fields.length && fields.every((key) => Object.hasOwn(obj, key)), 'fields');
  return obj;
}

function list(value: unknown, max: number, subject: string): unknown[] {
  check(Array.isArray(value) && value.length <= max && Array.from(value).every((item) => item !== undefined), `array:${subject}`);
  return value;
}

function text(value: unknown, max: number, empty = false): string {
  check(typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0), 'text');
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value), 'plain-text');
  return value;
}

function integer(value: unknown, min: number, max: number): number {
  check(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, 'index');
  return value;
}

function range(value: unknown, length: number): GraphemeRange {
  const obj = record(value, ['start', 'end']);
  const start = integer(obj.start, 0, length - 1);
  return { start, end: integer(obj.end, start + 1, length) };
}

const overlaps = (a: GraphemeRange, b: GraphemeRange) => a.start < b.end && b.start < a.end;
const hasLetter = (parts: string[], span: GraphemeRange) => /\p{L}/u.test(parts.slice(span.start, span.end).join(''));
/** IPA vowels and glides: a link needs a vowel-initial right word. */
const LINKABLE = /[aeiouyɑəɛœøɔãẽĩõũỹɛ̃œ̃ɔ̃jwɥ]/u;
/** French spelling: every syllable carries a vowel letter. */
const VOWEL_LETTER = /[aeiouyàâäéèêëîïôöùûüÿœæ]/iu;

/** Returns a new, bounded typed object; never render the provider's source echo. */
export function validatePronunciationMarkers(value: unknown, source: string): PronunciationMarkers {
  check(source.length <= MAX_PRONUNCIATION_SOURCE, 'oversize');
  const tokens = readerWords(source);
  const obj = record(value, ['version', 'source', 'words', 'connections', 'stress']);
  check(obj.version === 1, 'version');
  const echo = text(obj.source, MAX_PRONUNCIATION_SOURCE);
  check(normalizeMarkerSource(echo) === normalizeMarkerSource(source), 'source');
  const echoTokens = readerWords(echo);
  check(echoTokens.length === tokens.length, 'source-tokens');
  const entries = list(obj.words, tokens.length, 'words');
  check(entries.length === tokens.length, 'word-count');
  const words: PronunciationWord[] = [];
  const parts = tokens.map((token) => graphemes(token.text));
  const seen = new Set<number>();
  for (const entry of entries) {
    const word = record(entry, ['ordinal', 'source', 'status', 'ipa', 'boundaries', 'silent']);
    const ordinal = integer(word.ordinal, 0, tokens.length - 1);
    check(!seen.has(ordinal), 'duplicate-word');
    seen.add(ordinal);
    const written = text(word.source, MAX_PRONUNCIATION_SOURCE);
    check(normalizeMarkerSource(written) === normalizeMarkerSource(tokens[ordinal].text), 'word-source');
    check(normalizeMarkerSource(echoTokens[ordinal].text) === normalizeMarkerSource(written), 'echo-word');
    // Case folding must not change the number or identity of the indexed graphemes.
    const writtenParts = graphemes(written);
    check(writtenParts.length === parts[ordinal].length && writtenParts.every((part, index) =>
      part.toLowerCase() === parts[ordinal][index].toLowerCase()), 'grapheme-equivalence');
    const length = parts[ordinal].length;
    check(word.status === 'resolved' || word.status === 'unresolved', 'status');
    let ipa = list(word.ipa, length, `ipa:${ordinal}`).map((item) => text(item, 120));
    let boundaries = list(word.boundaries, length - 1, `boundaries:${ordinal}`).map((item) => integer(item, 1, length - 1));
    check(boundaries.every((position, index) => index === 0 || position > boundaries[index - 1]), 'boundary-order');
    const silent = list(word.silent, length, `silent:${ordinal}`).map((item) => range(item, length));
    check(silent.every((span, index) => index === 0 || span.start >= silent[index - 1].end), 'silent-order');
    // Elided-prefix spelling (l', d', j', m', qu'...) is always pronounced:
    // elision drops the vowel in spelling and the consonant links to the next
    // vowel. Trim model silence covering it instead of rejecting the sentence.
    const elided = graphemes(tokens[ordinal].prefix).length;
    const keptSilent = silent.flatMap((span) => span.start < elided ?
      (span.end > elided ? [{ start: elided, end: span.end }] : []) : [span]);
    if (word.status === 'unresolved') {
      check(ipa.length === 0 && boundaries.length === 0 && silent.length === 0, 'unresolved-data');
    } else {
      check(ipa.length === boundaries.length + 1, 'syllable-count');
      let edges = [0, ...boundaries, length];
      let spelling = edges.slice(1).map((end, index) => parts[ordinal].slice(edges[index], end).join(''));
      check(spelling.join('') === tokens[ordinal].text, 'reconstruction');
      if (spelling.some((slice) => !VOWEL_LETTER.test(slice))) {
        // Garbage segmentation (a vowel-less slice is not a syllable, e.g.
        // "a/ppa/rt/e/ment"): drop this word's slashes, keep the rest.
        boundaries = [];
        ipa = [ipa.join('')];
        edges = [0, length];
        spelling = [tokens[ordinal].text];
      }
      check(spelling.every((_, index) => parts[ordinal].slice(edges[index], edges[index + 1]).some((part, offset) =>
        /\p{L}/u.test(part) && !keptSilent.some((span) => edges[index] + offset >= span.start && edges[index] + offset < span.end))), 'silent-syllable');
    }
    words[ordinal] = { ordinal, source: tokens[ordinal].text, status: word.status, ipa, boundaries, silent: keptSilent };
  }

  const connected = new Set<number>();
  const connections = list(obj.connections, Math.max(0, tokens.length - 1), 'connections').map<PronunciationConnection | null>((entry) => {
    const conn = record(entry, ['left', 'right', 'type', 'sound', 'pronounced']);
    const left = integer(conn.left, 0, tokens.length - 2);
    const right = integer(conn.right, left + 1, left + 1);
    check(!connected.has(left), 'duplicate-connection');
    connected.add(left);
    check(words[left].status === 'resolved' && words[right].status === 'resolved', 'unresolved-connection');
    check(/^\s*$/u.test(source.slice(tokens[left].end, tokens[right].start)), 'connection-punctuation');
    check(conn.type === 'liaison' || conn.type === 'enchainement', 'connection-type');
    // No link is possible into a consonant-initial word (père ‿ s'appelle,
    // plus ‿ d'animaux): the model's own IPA contradicts the curve. Drop it.
    if (!LINKABLE.test(words[right].ipa[0]?.[0] ?? '')) return null;
    const pronounced = range(conn.pronounced, parts[left].length);
    check(hasLetter(parts[left], pronounced), 'silent-connection');
    // A letter realized in a connection is pronounced in this context; the
    // word-in-isolation silence claim loses. Trim the overlap instead of
    // rejecting, so "s silent" + "liaison s" resolves to the liaison.
    words[left].silent = words[left].silent.flatMap((span) => {
      if (span.start >= pronounced.end || span.end <= pronounced.start) return [span];
      const trimmed = [];
      if (span.start < pronounced.start) trimmed.push({ start: span.start, end: pronounced.start });
      if (span.end > pronounced.end) trimmed.push({ start: pronounced.end, end: span.end });
      return trimmed;
    });
    return { left, right, type: conn.type, sound: text(conn.sound, 40), pronounced };
  }).filter((connection): connection is PronunciationConnection => connection !== null);

  const stressed = new Set<number>();
  const stress = list(obj.stress, tokens.length, 'stress').map((entry) => {
    const mark = record(entry, ['word', 'syllable', 'anchor']);
    const word = integer(mark.word, 0, tokens.length - 1);
    check(words[word].status === 'resolved' && !stressed.has(word), 'stress-target');
    stressed.add(word);
    // Collapsed words have a single syllable; a stress beyond it is dropped.
    if (typeof mark.syllable !== 'number' || mark.syllable > words[word].ipa.length - 1) return null;
    const syllable = integer(mark.syllable, 0, words[word].ipa.length - 1);
    const anchor = range(mark.anchor, parts[word].length);
    const edges = [0, ...words[word].boundaries, parts[word].length];
    // Models anchor the audible rhyme, which can cross their own syllable
    // boundary by a grapheme (compagnie: anchor "gni" for the "nie" syllable).
    // Keep the part inside the syllable; an empty intersection is a wrong
    // syllable index, not imprecision.
    const marked = {
      start: Math.max(anchor.start, edges[syllable]),
      end: Math.min(anchor.end, edges[syllable + 1]),
    };
    check(marked.end > marked.start, 'stress-syllable');
    // The anchor only positions the dot: drop the silent letters it covers.
    // When nothing pronounced remains, the syllable's own pronounced spelling
    // is the intended anchor (each syllable keeps one by the check above).
    const audible = (from: number, to: number) => {
      const spans: GraphemeRange[] = [];
      let cursor = from;
      for (const span of words[word].silent) {
        if (span.start >= to || span.end <= from) continue;
        if (span.start > cursor) spans.push({ start: cursor, end: span.start });
        cursor = Math.max(cursor, span.end);
      }
      if (cursor < to) spans.push({ start: cursor, end: to });
      return spans;
    };
    const spans = audible(marked.start, marked.end);
    const chosen = spans.length
      ? { start: spans[0].start, end: spans[spans.length - 1].end }
      : audible(edges[syllable], edges[syllable + 1])[0];
    check(chosen && hasLetter(parts[word], chosen), 'silent-stress');
    return { word, syllable, anchor: chosen };
  }).filter((mark): mark is PronunciationStress => mark !== null);
  return { version: 1, source, words, connections, stress };
}

export function hasUsablePronunciationMarkers(markers: PronunciationMarkers): boolean {
  return markers.connections.length > 0 || markers.stress.length > 0 ||
    markers.words.some((word) => word.boundaries.length > 0 || word.silent.length > 0);
}
