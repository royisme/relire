/**
 * Minimal-pairs pack contract: the Zod schemas of the reviewed listening-contrast
 * corpus (French word pairs grouped by IPA contrast from the frenchIpa chart) and the
 * structural invariants checked at load (unique ids, distinct NFC words, contrast
 * symbols from the chart). Owns what a valid pack looks like. Does not own the
 * publish gate (scripts/minimal-pairs) nor loading. A pair's note is a locale key
 * `minimalPairs.notes.<id>`, never stored prose.
 */
import { z } from 'zod';
import { FRENCH_IPA } from '../data/frenchIpa';

const text = z.string().trim().min(1);
const slug = z.string().regex(/^[a-z]+(-[a-z]+)*$/);
const noteKey = /^minimalPairs\.notes\.[a-z]+(-[a-z]+)*$/;
const version = z.string().regex(/^\d+\.\d+\.\d+$/);

/** The symbols the IPA chart teaches; a contrast id joins two of them with "-". */
const chartSymbols = new Set(
  Object.values(FRENCH_IPA)
    .flat()
    .map(({ symbol }) => symbol),
);

export const ContrastIdSchema = z.string().superRefine((contrast, ctx) => {
  const parts = contrast.split('-');
  if (parts.length !== 2 || parts.some((symbol) => !chartSymbols.has(symbol))) {
    ctx.addIssue({
      code: 'custom',
      message: `contrast ${contrast} must join two symbols of the IPA chart with "-"`,
    });
  } else if (parts[0] === parts[1]) {
    ctx.addIssue({ code: 'custom', message: 'the two contrast symbols are the same' });
  }
});
export type ContrastId = z.infer<typeof ContrastIdSchema>;

const pairFields = {
  /** Ascii slug of the two words, unique. */
  id: slug,
  contrast: ContrastIdSchema,
  /** French words in NFC; no per-word IPA in v1. */
  a: text,
  b: text,
  /** Locale key of the reviewed note shown beside the pair. */
  note: z.string().regex(noteKey).optional(),
};

const checkWords = (pair: { a: string; b: string }, ctx: z.RefinementCtx): void => {
  for (const [key, word] of [
    ['a', pair.a],
    ['b', pair.b],
  ] as const) {
    if (word !== word.normalize('NFC')) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'string is not NFC' });
    }
    if (word.includes("'")) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'apostrophes must be U+2019' });
    }
  }
  if (pair.a === pair.b) {
    ctx.addIssue({ code: 'custom', path: ['b'], message: 'a and b are the same word' });
  }
};

/** An authored source row (data/minimal-pairs/pairs.json); status is never hand-typed. */
export const PairSchema = z.strictObject(pairFields).superRefine(checkWords);
export type Pair = z.infer<typeof PairSchema>;

/** A shipped row: the build derives this from a hash-matching review record. */
export const ReviewedPairSchema = z
  .strictObject({ ...pairFields, status: z.literal('reviewed'), reviewedBy: text, reviewedAt: z.iso.date() })
  .superRefine(checkWords);
export type ReviewedPair = z.infer<typeof ReviewedPairSchema>;

export const MinimalPairsPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    packVersion: version,
    pairs: z.array(ReviewedPairSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.pairs.forEach((pair, i) => {
      if (seen.has(pair.id))
        ctx.addIssue({ code: 'custom', path: ['pairs', i, 'id'], message: `duplicate id ${pair.id}` });
      seen.add(pair.id);
    });
  });
export type MinimalPairsPack = z.infer<typeof MinimalPairsPackSchema>;
