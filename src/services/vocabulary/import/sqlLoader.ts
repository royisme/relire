/** The browser-only sql.js build avoids Node polyfills; tests supply the same wasm as bytes. */
import type { SqlJsStatic } from 'sql.js';

let loading: Promise<SqlJsStatic> | undefined;

export function loadImportSql(wasmBinary?: Uint8Array): Promise<SqlJsStatic> {
  if (loading) return loading;
  loading = (async () => {
    const { default: initSqlJs } = await import('sql.js/dist/sql-wasm-browser.js');
    if (wasmBinary) return initSqlJs({ wasmBinary: new Uint8Array(wasmBinary).buffer });
    const { default: wasmUrl } = await import('sql.js/dist/sql-wasm-browser.wasm?url');
    return initSqlJs({ locateFile: () => wasmUrl });
  })().catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
