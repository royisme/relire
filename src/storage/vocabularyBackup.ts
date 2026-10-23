/** Paired vocabulary backup validation and namespace-only replacement within the caller's transaction. */
import { z } from 'zod';
import {
  VocabularyRowSchema,
  VocabularyDaySchema,
  VocabularyPreferencesSchema,
  VOCABULARY_SCHEDULER_POLICY,
} from '../types/vocabulary';
import type { RwStore } from './exerciseRows';
export const VocabularyMetaBackupSchema = z
  .strictObject({
    schedulerPolicy: z.literal(VOCABULARY_SCHEDULER_POLICY),
    preferences: VocabularyPreferencesSchema,
    days: z.array(VocabularyDaySchema),
  })
  .refine((m) => new Set(m.days.map((day) => day.date)).size === m.days.length, 'Duplicate vocabulary day');
const VocabularyBackupSchema = z
  .strictObject({ vocab: z.array(VocabularyRowSchema), vocabularyMeta: VocabularyMetaBackupSchema })
  .refine((b) => new Set(b.vocab.map((row) => row.key)).size === b.vocab.length, 'Duplicate vocabulary key');
export type VocabularyMetaBackup = z.infer<typeof VocabularyMetaBackupSchema>;
export function parseVocabularyBackup(data: { vocab?: unknown; vocabularyMeta?: unknown }) {
  if (data.vocab === undefined && data.vocabularyMeta === undefined) return undefined;
  return VocabularyBackupSchema.parse({ vocab: data.vocab, vocabularyMeta: data.vocabularyMeta });
}
export async function restoreVocabularyRows(
  stores: { vocab: RwStore<'vocab'>; meta: RwStore<'meta'> },
  backup: z.infer<typeof VocabularyBackupSchema>,
) {
  await stores.vocab.clear();
  for (const row of backup.vocab) await stores.vocab.put(row);
  for (const key of await stores.meta.getAllKeys())
    if (key === 'vocabularyPreferences' || key.startsWith('vocabularyDay:')) await stores.meta.delete(key);
  await stores.meta.put(backup.vocabularyMeta.preferences, 'vocabularyPreferences');
  for (const day of backup.vocabularyMeta.days) await stores.meta.put(day, `vocabularyDay:${day.date}`);
  const epoch = ((await stores.meta.get('vocabularyEpoch')) as number | undefined) ?? 0;
  await stores.meta.put(epoch + 1, 'vocabularyEpoch');
}
