/**
 * Fails when translations drift:
 *  - a key used in code is missing from a locale
 *  - the two locales have different keys or {{placeholders}}
 *  - Chinese text is hard-coded in a component instead of a locale file
 * Run with `bun run i18n:check`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const flat = (o: Record<string, unknown>, prefix = ''): Record<string, string> =>
  Object.entries(o).reduce((acc, [k, v]) => {
    if (v && typeof v === 'object') Object.assign(acc, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else acc[`${prefix}${k}`] = String(v);
    return acc;
  }, {} as Record<string, string>);

const en = flat(JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8')));
const zh = flat(JSON.parse(readFileSync('src/i18n/locales/zh.json', 'utf8')));
const base = (k: string) => k.replace(/_(one|other|zero)$/, '');
const has = (loc: Record<string, string>, k: string) => k in loc || ['_one', '_other', '_zero'].some((s) => k + s in loc);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

const problems: string[] = [];
const files = walk('src').filter((f) => !f.includes('/data/') && !f.includes('/i18n/'));

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"`]([\w.]+)['"`]/g)) {
    if (!has(en, m[1])) problems.push(`${file}: key "${m[1]}" missing in en.json`);
    if (!has(zh, m[1])) problems.push(`${file}: key "${m[1]}" missing in zh.json`);
  }
  src.split('\n').forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || code.startsWith('{/*')) return;
    if (/[一-鿿]/.test(code)) problems.push(`${file}:${i + 1}: hard-coded Chinese text`);
  });
}

for (const k of Object.keys(en)) if (!has(zh, base(k))) problems.push(`"${k}" is in en.json but not zh.json`);
for (const k of Object.keys(zh)) if (!(k in en) && !(base(k) in en)) problems.push(`"${k}" is in zh.json but not en.json`);
for (const k of Object.keys(en)) {
  const counterpart = k in zh ? k : base(k) + '_other';
  if (!(counterpart in zh)) continue;
  const a = [...en[k].matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join();
  const b = [...zh[counterpart].matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join();
  if (a !== b) problems.push(`"${k}": placeholders differ between en.json and zh.json`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('i18n OK');
