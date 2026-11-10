/** Resolves one human-facing body-version route: bundle first, exact opened snapshot, then a pinned service artifact. */
import { loadStarterReaders } from './load';
import { contentServiceUrl } from '../grammarTopics/service';
import { listReaderProgress } from '../../storage/gradedReaders';
import { validatePublishedReader } from './catalogue';
import { loadReaderCatalogue, loadRemoteReader } from './service';

export async function resolveReaderEdition(readerId: string, version?: string) {
  const bundled = (await loadStarterReaders()).find((reader) => reader.body.id === readerId);
  if (bundled) return version === undefined || bundled.version === version ? bundled : undefined;
  if (version) {
    const opened = (await listReaderProgress()).find((row) => row.readerId === readerId && row.version === version);
    if (opened) return validatePublishedReader(opened.snapshot);
  }
  if (!contentServiceUrl()) return undefined;
  const { catalogue } = await loadReaderCatalogue();
  const entry = catalogue.readers.find(
    (reader) => reader.id === readerId && (version === undefined || reader.version === version),
  );
  if (!entry) return undefined;
  return loadRemoteReader(entry);
}
