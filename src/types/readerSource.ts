/** Reader ownership, independent of the material's prose; never creates a Library article. */
import type { Article } from './index';
import type { ExerciseUnit } from './exercises';

export type ReaderSource =
  | { kind: 'article'; articleId: string }
  | { kind: 'passage'; materialId: string; unitId: string };

export type ReaderDocument = Pick<Article, 'title' | 'content' | 'level' | 'category' | 'source'>;

/** Explicit source namespaces for Reader ownership; recording keys keep their separate legacy format. */
export const passageIdentity = (materialId: string, unitId: string) =>
  `passage:${encodeURIComponent(JSON.stringify([materialId, unitId]))}`;
export const readerIdentity = (source: ReaderSource) =>
  source.kind === 'article'
    ? `article:${encodeURIComponent(source.articleId)}`
    : passageIdentity(source.materialId, source.unitId);
export const materialIdOf = (source: ReaderSource) =>
  source.kind === 'article' ? source.articleId : source.materialId;

export function passageDocument(material: Article, unit: ExerciseUnit): ReaderDocument | null {
  if (unit.materialId !== material.id || !unit.readingPassage?.content.trim()) return null;
  return {
    title: unit.readingPassage.title || unit.title,
    content: unit.readingPassage.content,
    level: material.level,
    category: unit.title,
    source: material.title,
  };
}
