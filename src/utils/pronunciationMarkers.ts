/** Runtime trust boundary for model/cache output; does not certify phonetic accuracy. */
import i18n from '../i18n';
import type {
  GraphemeRange,
  PronunciationConnection,
  PronunciationMarkers,
  PronunciationStress,
  PronunciationWord,
} from '../types/pronunciation';
import { MAX_PRONUNCIATION_SOURCE } from '../types/pronunciation';
import { graphemes, normalizeMarkerSource, readerWords, type ReaderWordToken } from './readerTokens';

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
  check(
    Array.isArray(value) && value.length <= max && Array.from(value).every((item) => item !== undefined),
    `array:${subject}`,
  );
  return value;
}

function text(value: unknown, max: number, empty = false): string {
  check(typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0), 'text');
  // Control characters are exactly what this rejects.
  // oxlint-disable-next-line no-control-regex
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
const LINKABLE = /[aeiouyɑəɛœøɔãẽĩõũỹjwɥ]/u;
/** A French spoken syllable needs an IPA vowel nucleus, not a written vowel.
 * Include lax Canadian variants; glides alone (j/w/ɥ) are not nuclei.
 */
const IPA_NUCLEUS = /[aeiouyɑɐəɛœøɔɒɪʊʏãẽĩõũỹ]/u;

/** One bad connection or stress mark is dropped alone; other errors still propagate. */
function dropInvalid<T>(run: () => T | null): T | null {
  try {
    return run();
  } catch (error) {
    if (error instanceof PronunciationValidationError) return null;
    throw error;
  }
}

/** A spoken vowel needs a pronounced written vowel: "je" /ʒə/ cannot have a silent e. */
const VOWEL_LETTER = /[aeiouyàâäéèêëîïôöùûüÿœæ]/iu;

const unresolvedWord = (ordinal: number, source: string): PronunciationWord => ({
  ordinal,
  source,
  status: 'unresolved',
  ipa: [],
  boundaries: [],
  silent: [],
});

/** Throws a validation error for anything local to this word; the caller demotes it. */
function validateWord(
  word: Record<string, unknown>,
  token: ReaderWordToken,
  parts: string[],
  length: number,
  originalSyllables: number[],
): PronunciationWord {
  const ordinal = token.ordinal;
  let ipa = list(word.ipa, length, `ipa:${ordinal}`).map((item) => text(item, 120));
  originalSyllables[ordinal] = ipa.length;
  let boundaries = list(word.boundaries, length - 1, `boundaries:${ordinal}`).map((item) =>
    integer(item, 1, length - 1),
  );
  check(
    boundaries.every((position, index) => index === 0 || position > boundaries[index - 1]),
    'boundary-order',
  );
  const silent = list(word.silent, length, `silent:${ordinal}`).map((item) => range(item, length));
  check(
    silent.every((span, index) => index === 0 || span.start >= silent[index - 1].end),
    'silent-order',
  );
  // Elided-prefix spelling (l', d', j', m', qu'...) is always pronounced:
  // elision drops the vowel in spelling and the consonant links to the next
  // vowel. Trim model silence covering it instead of rejecting the word.
  const elided = graphemes(token.prefix).length;
  const keptSilent = silent.flatMap((span) =>
    span.start < elided ? (span.end > elided ? [{ start: elided, end: span.end }] : []) : [span],
  );
  if (word.status === 'unresolved') {
    check(ipa.length === 0 && boundaries.length === 0 && silent.length === 0, 'unresolved-data');
    return unresolvedWord(ordinal, token.text);
  }
  check(ipa.length === boundaries.length + 1, 'syllable-count');
  let edges = [0, ...boundaries, length];
  let spelling = edges.slice(1).map((end, index) => parts.slice(edges[index], end).join(''));
  check(spelling.join('') === token.text, 'reconstruction');
  check(IPA_NUCLEUS.test(ipa.join('')), 'syllable-nucleus');
  if (ipa.some((syllable) => !IPA_NUCLEUS.test(syllable))) {
    // A consonant-only IPA entry (e.g. /t/ after schwa deletion) is not
    // a syllable. Suppress its segmentation without inventing boundaries.
    // Spelled initials like T/C/F remain valid: /te/se/ɛf/ have nuclei.
    boundaries = [];
    ipa = [ipa.join('')];
    edges = [0, length];
    spelling = [token.text];
  }
  const audible = (index: number) =>
    parts
      .slice(edges[index], edges[index + 1])
      .filter(
        (_, offset) =>
          !keptSilent.some((span) => edges[index] + offset >= span.start && edges[index] + offset < span.end),
      );
  check(
    spelling.every((_, index) => audible(index).some((part) => /\p{L}/u.test(part))),
    'silent-syllable',
  );
  // Spelled initials (TCF: /te.se.ɛf/) are the one place a vowel sound has no vowel letter.
  const initials = !/\p{Ll}/u.test(token.text);
  check(
    initials || spelling.every((_, index) => audible(index).some((part) => VOWEL_LETTER.test(part))),
    'silent-vowel',
  );
  return { ordinal, source: token.text, status: 'resolved', ipa, boundaries, silent: keptSilent };
}

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
  // Validate stress references against the input before any segmentation repair.
  const originalSyllables: number[] = [];
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
    check(
      writtenParts.length === parts[ordinal].length &&
        writtenParts.every((part, index) => part.toLowerCase() === parts[ordinal][index].toLowerCase()),
      'grapheme-equivalence',
    );
    const length = parts[ordinal].length;
    check(word.status === 'resolved' || word.status === 'unresolved', 'status');
    originalSyllables[ordinal] = 0;
    try {
      words[ordinal] = validateWord(word, tokens[ordinal], parts[ordinal], length, originalSyllables);
    } catch (error) {
      // A word-local inconsistency discards that word's marks, never the sentence.
      if (!(error instanceof PronunciationValidationError)) throw error;
      words[ordinal] = unresolvedWord(ordinal, tokens[ordinal].text);
    }
  }

  const connected = new Set<number>();
  const connections = list(obj.connections, Math.max(0, tokens.length - 1), 'connections')
    .map((entry) =>
      dropInvalid((): PronunciationConnection | null => {
        const conn = record(entry, ['left', 'right', 'type', 'sound', 'pronounced']);
        const left = integer(conn.left, 0, tokens.length - 2);
        const right = integer(conn.right, left + 1, left + 1);
        check(!connected.has(left), 'duplicate-connection');
        connected.add(left);
        check(words[left].status === 'resolved' && words[right].status === 'resolved', 'unresolved-connection');
        check(/^\s*$/u.test(source.slice(tokens[left].end, tokens[right].start)), 'connection-punctuation');
        check(conn.type === 'liaison' || conn.type === 'enchainement', 'connection-type');
        const pronounced = range(conn.pronounced, parts[left].length);
        const sound = text(conn.sound, 40);
        check(hasLetter(parts[left], pronounced), 'silent-connection');
        // Validate every field before filtering a well-formed impossible link.
        // No link is possible into a consonant-initial word (père ‿ s'appelle,
        // plus ‿ d'animaux): the model's own IPA contradicts the curve. Drop it.
        if (!LINKABLE.test(words[right].ipa[0]?.[0] ?? '')) return null;
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
        return { left, right, type: conn.type, sound, pronounced };
      }),
    )
    .filter((connection): connection is PronunciationConnection => connection !== null);

  const stressed = new Set<number>();
  const stress = list(obj.stress, tokens.length, 'stress')
    .map((entry) =>
      dropInvalid((): PronunciationStress | null => {
        const mark = record(entry, ['word', 'syllable', 'anchor']);
        const word = integer(mark.word, 0, tokens.length - 1);
        check(words[word].status === 'resolved' && !stressed.has(word), 'stress-target');
        stressed.add(word);
        const syllable = integer(mark.syllable, 0, originalSyllables[word] - 1);
        const anchor = range(mark.anchor, parts[word].length);
        // Only a valid reference whose segmentation was removed may be dropped.
        // Unsegmented words keep one IPA entry, not a claim of one spoken syllable.
        if (syllable > words[word].ipa.length - 1) return null;
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
        const spans = audible(marked.start, marked.end).filter((span) => hasLetter(parts[word], span));
        const candidates = spans.length
          ? spans
          : audible(edges[syllable], edges[syllable + 1]).filter((span) => hasLetter(parts[word], span));
        // Keep one continuous audible span: an envelope would put silent gaps
        // back under the dot (compte: m + t must not become mpt again).
        // Prefer the longest span, then the rightmost when lengths tie.
        const chosen = candidates.reduce<GraphemeRange | undefined>(
          (best, span) => (!best || span.end - span.start >= best.end - best.start ? span : best),
          undefined,
        );
        check(chosen && !words[word].silent.some((span) => overlaps(span, chosen)), 'silent-stress');
        return { word, syllable, anchor: chosen };
      }),
    )
    .filter((mark): mark is PronunciationStress => mark !== null);
  return { version: 1, source, words, connections, stress };
}

export function hasUsablePronunciationMarkers(markers: PronunciationMarkers): boolean {
  return (
    markers.connections.length > 0 ||
    markers.stress.length > 0 ||
    markers.words.some((word) => word.boundaries.length > 0 || word.silent.length > 0)
  );
}
