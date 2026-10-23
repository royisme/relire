/** Owns raw reader backup validation and namespace replacement; the caller owns transaction/notifications. */
import { z } from 'zod';
import { ReaderProgressSchema, readerProgressKey, type ReaderQuestionGrader } from '../types/readerProgress';
import { vocabularyHash } from '../services/vocabulary/book';
import type { RwStore } from './exerciseRows';

export async function parseGradedReaderBackup(data: { gradedReaders?: unknown }, grade?: ReaderQuestionGrader) {
  if (data.gradedReaders === undefined) return undefined;
  const rows = z.array(ReaderProgressSchema).parse(data.gradedReaders);
  const identities = new Set<string>();
  for (const row of rows) {
    const identity = readerProgressKey(row.readerId, row.version);
    if (identities.has(identity)) throw new Error('Duplicate reader edition');
    identities.add(identity);
    if ((await vocabularyHash(row.snapshot.body)) !== row.version) throw new Error('Reader snapshot hash mismatch');
    for (const item of row.snapshot.body.learning.checkpoints.flatMap((checkpoint) => checkpoint.questions)) {
      const saved = row.answers[item.question.id];
      if (!saved?.checked) continue;
      if (!grade) throw new Error('Reader question grader is required to validate checked backups');
      if (grade(item, saved.answer).correct !== saved.checked.correct) throw new Error('Reader verdict mismatch');
    }
  }
  return rows;
}
export async function restoreGradedReaderRows(meta: RwStore<'meta'>, rows: z.infer<typeof ReaderProgressSchema>[]) {
  for (const key of await meta.getAllKeys()) if (key.startsWith('readerProgress:')) await meta.delete(key);
  for (const row of rows) await meta.put(row, readerProgressKey(row.readerId, row.version));
  const epoch = ((await meta.get('readerEpoch')) as number | undefined) ?? 0;
  await meta.put(epoch + 1, 'readerEpoch');
}
