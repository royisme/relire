/** Ship PDF.js's local runtime resources without a copy-plugin dependency. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export function pdfjsAssets(): Plugin {
  const root = path.resolve(import.meta.dirname, '../node_modules/pdfjs-dist');
  const files = new Map<string, string>([['pdf.worker.min.mjs', path.join(root, 'build/pdf.worker.min.mjs')]]);
  for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    for (const file of readdirSync(path.join(root, directory)))
      files.set(`${directory}/${file}`, path.join(root, directory, file));
  }
  return {
    name: 'local-pdfjs-assets',
    generateBundle() {
      for (const [name, file] of files)
        this.emitFile({ type: 'asset', fileName: `pdfjs/${name}`, source: readFileSync(file) });
    },
    configureServer(server) {
      const prefix = `${server.config.base}pdfjs/`;
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? '';
        const file = pathname.startsWith(prefix) ? files.get(pathname.slice(prefix.length)) : undefined;
        if (!file) return next();
        const extension = path.extname(file);
        response.setHeader(
          'Content-Type',
          extension === '.mjs' || extension === '.js'
            ? 'text/javascript'
            : extension === '.wasm'
              ? 'application/wasm'
              : 'application/octet-stream',
        );
        response.end(readFileSync(file));
      });
    },
  };
}
