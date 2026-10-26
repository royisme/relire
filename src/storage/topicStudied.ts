/** The only module touching topicStudied: meta keys; owns marks, committed notifications and backup rows, not UI. */
import { TopicStudiedSchema, type TopicStudied } from '../types/topicStudied';
import { db } from './db';
import type { RwStore } from './exerciseRows';

const prefix = 'topicStudied:';
const storedSchema = TopicStudiedSchema.omit({ topicId: true });
const listeners = new Set<() => void | Promise<void>>();

export function subscribeTopicStudied(listener: () => void | Promise<void>) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function topicStudiedChanged() {
  await Promise.allSettled([...listeners].map(async (listener) => listener()));
}

async function write(action: (meta: RwStore<'meta'>) => Promise<void>): Promise<void> {
  const tx = (await db()).transaction('meta', 'readwrite');
  try {
    await action(tx.store);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already aborted. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
  await tx.done;
  await topicStudiedChanged();
}

export async function markTopicStudied(topicId: string, at: number): Promise<void> {
  const row = TopicStudiedSchema.parse({ topicId, at });
  await write(async (meta) => {
    const key = prefix + row.topicId;
    if ((await meta.get(key)) === undefined) await meta.put({ at: row.at }, key);
  });
}

export async function unmarkTopicStudied(topicId: string): Promise<void> {
  TopicStudiedSchema.shape.topicId.parse(topicId);
  await write(async (meta) => {
    await meta.delete(prefix + topicId);
  });
}

/** Export uses its existing meta snapshot so the backup cannot mix transactions. */
export function exportTopicStudied(meta: ReadonlyMap<string, unknown>): TopicStudied[] {
  return [...meta]
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) =>
      TopicStudiedSchema.parse({ topicId: key.slice(prefix.length), ...storedSchema.parse(value) }),
    )
    .sort((a, b) => a.topicId.localeCompare(b.topicId));
}

export async function listTopicStudied(): Promise<TopicStudied[]> {
  const tx = (await db()).transaction('meta');
  const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
  const [keys, values] = await Promise.all([tx.store.getAllKeys(range), tx.store.getAll(range)]);
  await tx.done;
  return exportTopicStudied(new Map(keys.map((key, index) => [key, values[index]])));
}

/** Rows are validated before the caller opens its whole-restore transaction. */
export async function restoreTopicStudied(meta: RwStore<'meta'>, rows: TopicStudied[]) {
  for (const key of await meta.getAllKeys()) if (key.startsWith(prefix)) await meta.delete(key);
  for (const row of rows) await meta.put({ at: row.at }, prefix + row.topicId);
}
