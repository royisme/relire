/** Saved spelling-drill provenance and playback policy; no pack loading or exercise preparation. */
import { z } from 'zod';
import { SpellingSoundPatternSchema } from './spellingSounds';

export const SpellingDrillMetaSchema = z.strictObject({
  source: z.literal('spelling-sounds'),
  patternId: SpellingSoundPatternSchema.shape.id,
  strictAccents: z.literal(true),
  playbackEngine: z.literal('device'),
});
