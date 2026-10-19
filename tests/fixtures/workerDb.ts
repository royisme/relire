/** Owns the shared test D1 read adapter over SQLite and the real Worker migration; no seed content. */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type { Env } from '../../worker/src/index';

export async function createWorkerDb() {
  const db = new Database(':memory:');
  db.exec(await Bun.file(new URL('../../worker/migrations/0001_init.sql', import.meta.url)).text());
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
  };
  return { db, env };
}
