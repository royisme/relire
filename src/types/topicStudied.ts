/** Owns the studied-topic fact and duplicate-free backup contract; no content-list dependency. */
import { z } from 'zod';
import { GrammarTopicSchema } from './grammarTopic';

export const TopicStudiedSchema = z.strictObject({
  topicId: GrammarTopicSchema.shape.id,
  at: z.number().int().positive(),
});
export type TopicStudied = z.infer<typeof TopicStudiedSchema>;

export const TopicStudiedArraySchema = z.array(TopicStudiedSchema).superRefine((rows, ctx) => {
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (ids.has(row.topicId))
      ctx.addIssue({ code: 'custom', path: [index, 'topicId'], message: 'Duplicate studied topic' });
    ids.add(row.topicId);
  });
});
