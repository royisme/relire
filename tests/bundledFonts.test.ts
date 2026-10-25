/** Pins the bundled-font privacy contract without a browser, server or network request. */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const fileUrl = (path: string) => new URL(`../${path}`, import.meta.url);
const text = (path: string) => readFileSync(fileUrl(path), 'utf8');
const googleFontHosts = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const fontFiles = ['source-serif-4.woff2', 'source-serif-4-italic.woff2', 'public-sans.woff2', 'fira-code.woff2'];
const faces = [
  { family: 'Source Serif 4', style: 'normal', file: 'source-serif-4.woff2' },
  { family: 'Source Serif 4', style: 'italic', file: 'source-serif-4-italic.woff2' },
  { family: 'Public Sans', style: 'normal', file: 'public-sans.woff2' },
  { family: 'Fira Code', style: 'normal', file: 'fira-code.woff2' },
];

describe('bundled fonts', () => {
  test.each([
    'index.html',
    'marketing/index.html',
    'marketing/zh/index.html',
    'marketing/styles.css',
    'src/index.css',
    'vite.config.ts',
  ])('%s has no Google font host, including escaped runtimeCaching patterns', (path) => {
    const source = text(path).replaceAll('\\', '').toLowerCase();
    for (const host of googleFontHosts) expect(source).not.toContain(host);
  });

  test.each(fontFiles)('%s is a nontrivial WOFF2 binary', (name) => {
    const bytes = readFileSync(fileUrl(`public/fonts/${name}`));
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('wOF2');
    expect(bytes.length).toBeGreaterThan(10 * 1024);
  });

  test.each(['source-serif-4', 'public-sans', 'fira-code'])('%s ships its OFL licence', (family) => {
    expect(text(`public/fonts/OFL-${family}.txt`)).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  test('ships a font README', () => {
    expect(text('public/fonts/README.txt').trim().length).toBeGreaterThan(0);
  });

  test.each(['src/index.css', 'marketing/styles.css'])('%s declares swap faces backed by bundled files', (path) => {
    const css = text(path).replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = [...css.matchAll(/@font-face\s*\{([^}]+)\}/gi)].map((match) => {
      const declarations = Object.fromEntries(
        [...match[1].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map((entry) => [
          entry[1],
          entry[2].trim().replace(/['"]/g, ''),
        ]),
      );
      return { body: match[1], declarations };
    });
    const expected = path === 'src/index.css' ? faces : faces.filter((face) => face.family !== 'Fira Code');
    for (const face of expected) {
      const matching = blocks.filter(
        ({ declarations }) =>
          declarations['font-family'] === face.family && (declarations['font-style'] ?? 'normal') === face.style,
      );
      expect(matching.length).toBeGreaterThan(0);
      expect(matching.some(({ body }) => body.includes(face.file))).toBe(true);
    }
    for (const { body, declarations } of blocks) {
      expect(declarations['font-display']).toBe('swap');
      const urls = [...body.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)];
      expect(urls.length).toBeGreaterThan(0);
      for (const [, url] of urls) {
        expect(url).toMatch(/^\/?fonts\/[^/]+\.woff2$/);
        expect(readFileSync(fileUrl(`public/${url.replace(/^\//, '')}`)).length).toBeGreaterThan(0);
      }
    }
  });

  test.each([
    ['src/index.css', '--font-serif', 'Source Serif 4'],
    ['src/index.css', '--font-sans', 'Public Sans'],
    ['src/index.css', '--font-mono', 'Fira Code'],
    ['marketing/styles.css', '--serif', 'Source Serif 4'],
    ['marketing/styles.css', '--sans', 'Public Sans'],
  ])('%s keeps %s starting with %s', (path, token, family) => {
    expect(text(path)).toMatch(new RegExp(`${token}:\\s*['"]${family}['"]\\s*,`));
  });

  test('Pages copies the fonts beside the shared marketing stylesheet', () => {
    const workflow = text('.github/workflows/pages.yml');
    expect(workflow).toMatch(/^\s*cp\s+-R\s+public\/fonts\s+site\/fonts\/?\s*$/m);
    expect(workflow).toMatch(/^\s*cp\s+marketing\/styles\.css\s+site\/styles\.css\s*$/m);
    for (const path of ['marketing/index.html', 'marketing/zh/index.html']) {
      const href = text(path).match(/<link\s+rel="stylesheet"\s+href="([^"]+)"/);
      expect(href).not.toBeNull();
      expect(new URL(href![1], fileUrl(path)).href).toBe(fileUrl('marketing/styles.css').href);
    }
  });

  test('the topic fixture no longer exempts or stubs Google fonts and keeps local fonts allowed', () => {
    const fixture = text('e2e/grammar-topic-learning.fixture.ts');
    for (const host of googleFontHosts) expect(fixture).not.toContain(host);
    expect(fixture).toContain("url.origin === 'http://localhost:5174'");
    expect(fixture).toContain('fonts\\/');
  });

  test.each([
    {
      path: 'README.md',
      bundled: /fonts?[^.!?\n]*(?:bundl|self.host)/i,
      host: /\bhost(?:ing)?\b/i,
      service: /optional[^.!?\n]*content service/i,
      unqualified: /nothing goes through any other server/i,
    },
    {
      path: 'README.zh-CN.md',
      bundled: /\u5b57\u4f53[^\u3002\n]*(?:\u6253\u5305|\u5185\u7f6e)/,
      host: /\u4e3b\u673a|\u6258\u7ba1/,
      service: /\u53ef\u9009[^\u3002\n]*\u5185\u5bb9\u670d\u52a1/,
      unqualified: /\u4e0d\u7ecf\u8fc7\u4efb\u4f55\u5176\u4ed6\u670d\u52a1\u5668/,
    },
  ])('$path qualifies privacy claims and mentions bundled fonts', ({ path, bundled, host, service, unqualified }) => {
    const readme = text(path);
    expect(readme).toMatch(bundled);
    expect(readme).toMatch(host);
    expect(readme).toMatch(service);
    expect(readme).not.toMatch(unqualified);
  });
});
