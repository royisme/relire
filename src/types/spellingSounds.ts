/** Owns spelling-sound source, review and pack contracts; not linguistic gates, assembly or loading. */
import { z } from 'zod';
import { FRENCH_IPA } from '../data/frenchIpa';

const slug = z.string().regex(/^[a-z]+(-[a-z]+)*$/);
const text = z.string().refine((value) => value.trim().length > 0, 'must not be blank');
const lowercaseNfc = text.refine(
  (value) => value === value.normalize('NFC') && value === value.toLowerCase(),
  'must be lowercase NFC',
);
const symbols = new Set(
  Object.values(FRENCH_IPA)
    .flat()
    .map(({ symbol }) => symbol),
);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const kind = z.enum(['ai', 'human']);

export const SpellingSoundPatternSchema = z
  .strictObject({
    id: slug,
    spelling: lowercaseNfc,
    group: z.enum(['vowels', 'nasals', 'consonants', 'silent']),
    sound: z.array(z.string().refine((symbol) => symbols.has(symbol), 'must be a French IPA chart symbol')).max(2),
    examples: z
      .array(lowercaseNfc.regex(/^[\p{L}’-]+$/u))
      .min(3)
      .max(4)
      .refine((words) => new Set(words).size === words.length, 'examples must be distinct'),
  })
  .refine((row) => (row.group === 'silent') === (row.sound.length === 0), {
    path: ['sound'],
    message: 'only silent patterns require an empty sound array',
  });
export type SpellingSoundPattern = z.infer<typeof SpellingSoundPatternSchema>;

export const SpellingSoundsSourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  patterns: z.array(SpellingSoundPatternSchema).max(24),
});
export type SpellingSoundsSource = z.infer<typeof SpellingSoundsSourceSchema>;

function hasPrefix(value: { kind: 'ai' | 'human'; by: string }): boolean {
  const prefix = value.kind === 'ai' ? 'AI review:' : 'Human review:';
  return value.by.startsWith(prefix) && value.by.slice(prefix.length).trim().length > 0;
}

export const SpellingSoundsReviewRecordSchema = z
  .strictObject({
    id: slug,
    rowHash: hash,
    kind,
    reviewedBy: text,
    reviewedAt: z.iso.date(),
    reference: text,
  })
  .refine((record) => hasPrefix({ kind: record.kind, by: record.reviewedBy }), {
    path: ['reviewedBy'],
    message: 'reviewer must carry the matching AI review: or Human review: prefix',
  });
export const SpellingSoundsReviewsSchema = z.strictObject({ records: z.array(SpellingSoundsReviewRecordSchema) });
export type SpellingSoundsReviews = z.infer<typeof SpellingSoundsReviewsSchema>;

const review = z.strictObject({ kind, by: text, at: z.iso.date() }).refine(hasPrefix, {
  path: ['by'],
  message: 'reviewer must carry the matching AI review: or Human review: prefix',
});
export const SpellingSoundsPackSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    packVersion: text,
    patterns: z.array(SpellingSoundPatternSchema.safeExtend({ review })).min(1).max(24),
  })
  .superRefine((pack, ctx) => {
    const ids = new Set<string>();
    const words = new Set<string>();
    pack.patterns.forEach((row, index) => {
      if (ids.has(row.id))
        ctx.addIssue({ code: 'custom', path: ['patterns', index, 'id'], message: `duplicate id ${row.id}` });
      ids.add(row.id);
      for (const word of row.examples) {
        if (words.has(word))
          ctx.addIssue({ code: 'custom', path: ['patterns', index, 'examples'], message: `duplicate example ${word}` });
        words.add(word);
      }
    });
  });
export type SpellingSoundsPack = z.infer<typeof SpellingSoundsPackSchema>;
