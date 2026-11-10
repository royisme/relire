/** The small saved noun-drill feedback contract, independent of the current pack and its loader. */
import { z } from 'zod';

export const NounGenderRuleIdSchema = z.enum([
  'tion',
  'sion',
  'te',
  'ure',
  'ette',
  'ance',
  'ence',
  'ie',
  'age',
  'ment',
  'isme',
  'eau',
  'oir',
  'ier',
  'ee',
  'esse',
  'ude',
]);

export const NounGenderDrillMetaSchema = z
  .object({
    source: z.literal('noun-gender'),
    nounId: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
    rules: z
      .array(
        z.object({
          id: NounGenderRuleIdSchema,
          percent: z.number().min(0).max(100),
          n: z.number().int().positive(),
        }),
      )
      .max(1),
    exception: z.boolean(),
  })
  .refine((meta) => !meta.exception || meta.rules.length === 1, {
    message: 'An exception requires a matching rule',
  });

/** Unknown or malformed worksheet metadata must never produce a rule caption or crash a control. */
export function nounGenderDrillMeta(meta: unknown) {
  const result = NounGenderDrillMetaSchema.safeParse(meta);
  return result.success ? result.data : undefined;
}

/** Truncate to a tenth: a measured tendency below 100% must never be rounded to certainty. */
export const tendencyPercent = (percent: number) => Math.floor(percent * 10) / 10;
