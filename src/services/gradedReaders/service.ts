/** Owns credential-free reader requests, exact artifact validation and network-only offline fallback; no learner writes. */
import { getCached, putCached, putReaderOffline } from '../../storage/cache';
import { contentServiceFetch, contentServiceUrl, ContentServiceNetworkError } from '../grammarTopics/service';
import {
  validatePublishedReader,
  validateReaderCatalogue,
  type ReaderSummary,
  type ReaderCatalogue,
} from './catalogue';
import type { PublishedReader } from '../../types/gradedReader';

const pending = new Map<string, Promise<unknown>>();
const keyFor = (path: string) => `${contentServiceUrl()}${path}`;
const cataloguePath = '/v1/readers';
const artifactPath = (entry: ReaderSummary) => `/v1/readers/${entry.id}?version=${entry.artifactHash}`;

function shared<T>(key: string, request: () => Promise<T>): Promise<T> {
  const current = pending.get(key);
  if (current) return current as Promise<T>;
  const promise = request().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
async function exactHash(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function parseArtifact(text: string, entry: ReaderSummary): Promise<PublishedReader> {
  if ((await exactHash(text)) !== entry.artifactHash) throw new Error('Reader artifact hash mismatch');
  const reader = await validatePublishedReader(JSON.parse(text));
  if (
    reader.body.id !== entry.id ||
    reader.version !== entry.version ||
    reader.body.order !== entry.order ||
    reader.body.level !== entry.level ||
    JSON.stringify(reader.body.title) !== JSON.stringify(entry.title)
  )
    throw new Error('Reader artifact does not match catalogue');
  return reader;
}
export function loadReaderCatalogue(): Promise<{ catalogue: ReaderCatalogue; saved: boolean }> {
  if (!contentServiceUrl()) throw new Error('Content service is not configured');
  const key = keyFor(cataloguePath);
  return shared(key, async () => {
    let raw: unknown;
    try {
      raw = await contentServiceFetch(cataloguePath);
    } catch (error) {
      if (!(error instanceof ContentServiceNetworkError)) throw error;
      const hash = await getCached<string>('content', key);
      const cached = hash && (await getCached<unknown>('content', `${key}?version=${hash}`));
      if (cached === undefined || !hash) throw error;
      const catalogue = await validateReaderCatalogue(cached);
      if (catalogue.version !== hash) throw new Error('Saved reader catalogue identity mismatch');
      return { catalogue, saved: true };
    }
    const catalogue = await validateReaderCatalogue(raw);
    await putCached('content', `${key}?version=${catalogue.version}`, catalogue);
    await putCached('content', key, catalogue.version);
    return { catalogue, saved: false };
  });
}
async function requestArtifact(entry: ReaderSummary) {
  if (!contentServiceUrl()) throw new Error('Content service is not configured');
  const path = artifactPath(entry);
  return shared(keyFor(path), async () => {
    let text: string;
    try {
      text = await contentServiceFetch(path, 'text');
    } catch (error) {
      if (!(error instanceof ContentServiceNetworkError)) throw error;
      const cached = await getCached<string>('content', keyFor(path));
      if (cached === undefined) throw error;
      await parseArtifact(cached, entry);
      return cached;
    }
    await parseArtifact(text, entry);
    await putCached('content', keyFor(path), text);
    return text;
  });
}
export async function loadRemoteReader(entry: ReaderSummary): Promise<PublishedReader> {
  return parseArtifact(await requestArtifact(entry), entry);
}
export async function keepReaderOffline(entry: ReaderSummary): Promise<void> {
  const text = await requestArtifact(entry);
  await parseArtifact(text, entry);
  await putReaderOffline(keyFor(artifactPath(entry)), text);
}
