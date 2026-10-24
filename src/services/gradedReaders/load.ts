/** Owns lazy starter validation, promise memoisation and the resolved readers; not list UI state or progress storage. */
import { vocabularyHash } from '../vocabulary/book';
import { StarterFileSchema, type PublishedReader } from '../../types/gradedReader';

let pending: Promise<PublishedReader[]> | undefined;
let loaded: PublishedReader[] | undefined;

/** The validated starter pack once a load has succeeded, else undefined (never loading, never failed). */
export const loadedStarterReaders = () => loaded;

export function loadStarterReaders(data?: unknown): Promise<PublishedReader[]> {
  pending ??= (async () => {
    const source = data === undefined ? (await import('../../data/graded-readers/starter.json')).default : data;
    const parsed = StarterFileSchema.safeParse(source);
    if (!parsed.success) {
      throw new Error(
        `The graded-readers starter was not usable: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    // Recompute every body hash: a pack that fails anywhere is rejected whole, never partially salvaged.
    const problems: string[] = [];
    for (const reader of parsed.data.readers)
      if ((await vocabularyHash(reader.body)) !== reader.version)
        problems.push(`${reader.body.id}: published version does not match its body hash`);
    if (problems.length) throw new Error(`The graded-readers starter was not usable: ${problems.join('; ')}`);
    loaded = parsed.data.readers;
    return loaded;
  })().catch((error: unknown) => {
    // Only success is memoised: a failed load stays retryable with its real error.
    pending = undefined;
    throw error;
  });
  return pending;
}

/** The loaded edition of one bundled reader; a pinned version yields nothing unless it matches exactly. */
export function findStarterReader(readerId: string, version?: string): PublishedReader | undefined {
  return loaded?.find((reader) => reader.body.id === readerId && (version === undefined || reader.version === version));
}

/** Only for isolated loader tests; application callers share one validated pack. */
export function resetStarterReadersForTests(): void {
  pending = undefined;
  loaded = undefined;
}
