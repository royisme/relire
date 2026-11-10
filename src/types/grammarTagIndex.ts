/** Owns the small tag-index contract without depending on topic content schemas. */
import { z } from 'zod';
import { GrammarTagSchema } from './grammar';

export const grammarTopicSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const GrammarTagIndexSchema = z.partialRecord(GrammarTagSchema, z.array(grammarTopicSlug).min(1));
export type GrammarTagIndex = z.infer<typeof GrammarTagIndexSchema>;
