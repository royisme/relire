/** Owns the shared test D1 read adapter over SQLite and the real Worker migrations; no seed content. */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type { Env } from '../../worker/src/index';

export const WORKER_ACCESS_KEY = 'TEST-only-service-access-key-not-a-secret';

export function workerRequest(url: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${WORKER_ACCESS_KEY}`);
  return new Request(url, { ...init, headers });
}

export async function createWorkerDb() {
  const db = new Database(':memory:');
  for (const migration of ['0001_init.sql', '0003_vocabulary.sql', '0004_readers.sql'])
    db.exec(await Bun.file(new URL(`../../worker/migrations/${migration}`, import.meta.url)).text());
  const env: Env = {
    DB: {
      prepare(sql: string) {
        const statement = db.query(sql);
        let bindings: SQLQueryBindings[] = [];
        return {
          bind(...values: SQLQueryBindings[]) {
            bindings = values;
            return this;
          },
          all<T>() {
            return Promise.resolve({ results: statement.all(...bindings) as T[] });
          },
          first<T>() {
            return Promise.resolve(statement.get(...bindings) as T | null);
          },
        };
      },
    } as unknown as Env['DB'],
    ALLOWED_ORIGINS: '',
    ACCESS_KEYS: WORKER_ACCESS_KEY,
  };
  return { db, env };
}
