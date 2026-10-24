/** Owns the reader status join with learner progress, shared by the starter list and Today; not catalogue loading, sorting or rendering. */
import type { PublishedReader } from '../../types/gradedReader';
import type { ReaderProgress } from '../../types/readerProgress';
import type { ReaderSummary } from './catalogue';

export function readerListStatus(
  reader: PublishedReader | ReaderSummary,
  rows: ReaderProgress[],
): { status: 'read' | 'opened' | 'notOpened'; earlier: ReaderProgress | undefined };
// The permissive shape the starter list calls: unavailable progress (rows undefined) reads as `unavailable`, never as notOpened.
export function readerListStatus(
  reader: PublishedReader | ReaderSummary,
  rows?: ReaderProgress[],
): { status: 'unavailable' | 'read' | 'opened' | 'notOpened'; earlier: ReaderProgress | undefined };
export function readerListStatus(reader: PublishedReader | ReaderSummary, rows?: ReaderProgress[]) {
  const id = 'body' in reader ? reader.body.id : reader.id;
  const current = rows?.find((row) => row.readerId === id && row.version === reader.version);
  return {
    status:
      rows === undefined ? 'unavailable' : current?.completedAt != null ? 'read' : current ? 'opened' : 'notOpened',
    earlier: rows?.find((row) => row.readerId === id && row.version !== reader.version && row.completedAt !== null),
  };
}
