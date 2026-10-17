/** Add-only creation of an imported material and its initial units; public entry point is exercises.ts. */
import type { Article } from '../types';
import { ExerciseUnitSchema, type ExerciseUnit } from '../types/exercises';
import { db } from './db';
import { exercisesChanged } from './exerciseEvents';

/** Never adopts an existing id. A rejected transaction leaves the prepared payload safe to retry unchanged. */
export async function createImportedMaterial(article: Article, units: ExerciseUnit[]): Promise<void> {
  if (!article.id.trim() || !article.title.trim()) throw new Error('An imported material requires an id and title');
  if (article.kind !== 'workbook' && !article.content.trim())
    throw new Error('An imported article requires source text');
  const rows = units.map((unit) => ExerciseUnitSchema.parse(unit));
  if (article.kind === 'workbook' && !rows.length) throw new Error('An imported workbook requires initial units');
  if (new Set(rows.map((unit) => unit.id)).size !== rows.length) throw new Error('Duplicate initial unit IDs');
  if (rows.some((unit) => unit.materialId !== article.id))
    throw new Error('Initial units must belong to the imported material');
  const tx = (await db()).transaction(['articles', 'units', 'meta'], 'readwrite');
  try {
    await tx.objectStore('articles').add(article);
    for (const unit of rows) await tx.objectStore('units').add(unit);
    await tx.objectStore('meta').put(true, 'started');
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // A failing request may already have auto-aborted the transaction.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
  if (rows.length) exercisesChanged();
}
