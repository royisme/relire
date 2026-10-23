/** Reader ownership, independent of the material's prose; never creates a Library article. */
import type { Article } from './index';
import type { ExerciseUnit } from './exercises';
import type { PublishedReader } from './gradedReader';
import { unitTitle } from '../services/exercises/setLabel';

export type RecordableReaderSource = { kind: 'article'; articleId: string } | { kind: 'passage'; unitId: string };
export type ReaderSource = RecordableReaderSource | { kind: 'graded'; readerId: string; version: string };

export type ReaderDocument = Pick<Article, 'title' | 'content' | 'level' | 'category' | 'source'>;

/** Explicit source namespaces for Reader ownership; article recording keys keep the plain `articleId|sentence` format. */
export const passageIdentity = (unitId: string) => `passage:${encodeURIComponent(unitId)}`;
export const readerIdentity = (source: ReaderSource) =>
  source.kind === 'article'
    ? `article:${encodeURIComponent(source.articleId)}`
    : source.kind === 'passage'
      ? passageIdentity(source.unitId)
      : `graded:${encodeURIComponent(source.readerId)}:${source.version}`;

/** Display only: an authored edition never becomes an Article or a Library row. */
export function gradedDocument(reader: PublishedReader): ReaderDocument {
  return {
    title: reader.body.title.fr,
    content: reader.body.sentences.map((sentence) => sentence.fr).join('\n'),
    level: reader.body.level,
    category: '',
    source: reader.review.reviewedBy,
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
