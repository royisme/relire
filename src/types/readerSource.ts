/** Reader ownership, independent of the material's prose; never creates a Library article. */
import type { TFunction } from 'i18next';
import type { Article } from './index';
import type { ExerciseUnit } from './exercises';
import type { PublishedReader } from './gradedReader';
import { unitTitle } from '../services/exercises/setLabel';

export type ReaderSource =
  | { kind: 'article'; articleId: string }
  | { kind: 'passage'; unitId: string }
  | { kind: 'graded'; readerId: string; version: string };

export type ReaderDocument = Pick<Article, 'title' | 'content' | 'level' | 'category' | 'source'>;

/** Explicit source namespaces for Reader ownership; article recording keys keep the plain `articleId|sentence` format. */
export const passageIdentity = (unitId: string) => `passage:${encodeURIComponent(unitId)}`;
export const readerIdentity = (source: ReaderSource) =>
  source.kind === 'article'
    ? `article:${encodeURIComponent(source.articleId)}`
    : source.kind === 'passage'
      ? passageIdentity(source.unitId)
      : `graded:${encodeURIComponent(source.readerId)}:${source.version}`;

/**
 * The header's short label for a review record. The full record (`scripts/graded-readers/review.ts` writes
 * `AI review: …` or `Human review: …`) stays out of the header: it is a provenance log, not a display string.
 */
export const reviewSourceKey = (
  reviewedBy: string,
): 'gradedReader.sourceAi' | 'gradedReader.sourceHuman' | 'gradedReader.sourceUnknown' =>
  reviewedBy.startsWith('AI review:')
    ? 'gradedReader.sourceAi'
    : reviewedBy.startsWith('Human review:')
      ? 'gradedReader.sourceHuman'
      : 'gradedReader.sourceUnknown';

/** Display only: an authored edition never becomes an Article or a Library row. */
export function gradedDocument(reader: PublishedReader, t: TFunction): ReaderDocument {
  return {
    title: reader.body.title.fr,
    content: reader.body.sentences.map((sentence) => sentence.fr).join('\n'),
    level: reader.body.level,
    category: '',
    source: t(reviewSourceKey(reader.review.reviewedBy)),
  };
}

/** The unit's passage as a Reader document; `source` is the batch label (see `setLabel`). */
export function passageDocument(unit: ExerciseUnit, source: string, language?: string): ReaderDocument | null {
  if (!unit.readingPassage?.content.trim()) return null;
  return {
    title: unit.readingPassage.title || unitTitle(unit, language),
    content: unit.readingPassage.content,
    level: unit.level,
    category: unitTitle(unit, language),
    source,
  };
}
