/** Device-only game activity, including partial chunks, separate from scheduler rows and review history. */
import { z } from 'zod';
import { VocabularyDateSchema } from '../../../types/vocabulary';

const RunLogRecordSchema = z.strictObject({
  date: VocabularyDateSchema,
  mode: z.literal('game'),
  chunkSize: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  ratings: z.number().int().nonnegative(),
});
export const VocabularyRunLogSchema = z.array(RunLogRecordSchema).max(90);
export type VocabularyRunRecord = z.infer<typeof RunLogRecordSchema>;

export function appendRunLog(
  records: readonly VocabularyRunRecord[],
  record: VocabularyRunRecord,
): VocabularyRunRecord[] {
  return [...records, record].slice(-90);
}
