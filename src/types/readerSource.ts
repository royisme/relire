/** Reader ownership, independent of the material's prose; never creates a Library article. */
import type { Article } from './index';
import type { ExerciseUnit } from './exercises';

export type ReaderSource = { kind: 'article'; articleId: string } | { kind: 'passage'; unitId: string };

export type ReaderDocument = Pick<Article, 'title' | 'content' | 'level' | 'category' | 'source'>;

/** Explicit source namespaces for Reader ownership; article recording keys keep the plain `articleId|sentence` format. */
export const passageIdentity = (unitId: string) => `passage:${encodeURIComponent(unitId)}`;
export const readerIdentity = (source: ReaderSource) =>
  source.kind === 'article' ? `article:${encodeURIComponent(source.articleId)}` : passageIdentity(source.unitId);

/** The unit's passage as a Reader document; `source` is the batch label (see `setLabel`). */
export function passageDocument(unit: ExerciseUnit, source: string): ReaderDocument | null {
  if (!unit.readingPassage?.content.trim()) return null;
  return {
    title: unit.readingPassage.title || unit.title,
    content: unit.readingPassage.content,
    level: unit.level,
    category: unit.title,
    source,
  };
}
