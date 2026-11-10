/** Owns the code-shape check's rules and its ledger ratchet, on invented files. */
import { expect, test } from 'bun:test';
import {
  checkShape,
  GENERIC_NAMES,
  MAX_FILE_LINES,
  MAX_LINE_CHARS,
  measure,
  tighten,
  type Ledger,
} from '../scripts/check-code-shape';

const empty = (): Ledger => ({ longFiles: {}, longLines: {}, genericNames: [] });
const lines = (count: number, width = 10) => Array.from({ length: count }, () => 'x'.repeat(width)).join('\n') + '\n';

test('a trailing newline is not a line, and the width limit is inclusive', () => {
  expect(measure(lines(3)).lines).toBe(3);
  expect(measure('x'.repeat(MAX_LINE_CHARS) + '\n').longLines).toBe(0);
  expect(measure('x'.repeat(MAX_LINE_CHARS + 1) + '\n').longLines).toBe(1);
});

test('a file at the line limit passes and one line more fails by name', () => {
  expect(checkShape([{ path: 'src/a.ts', text: lines(MAX_FILE_LINES) }], empty()).violations).toEqual([]);
  expect(checkShape([{ path: 'src/a.ts', text: lines(MAX_FILE_LINES + 1) }], empty()).violations).toEqual([
    `src/a.ts: ${MAX_FILE_LINES + 1} lines; the limit is ${MAX_FILE_LINES}`,
  ]);
});

test('a line over the width limit fails by name with its count', () => {
  const text = lines(2) + 'y'.repeat(MAX_LINE_CHARS + 1) + '\n' + 'y'.repeat(MAX_LINE_CHARS + 5) + '\n';
  expect(checkShape([{ path: 'src/a.ts', text }], empty()).violations).toEqual([
    `src/a.ts: 2 lines over ${MAX_LINE_CHARS} characters; 0 allowed`,
  ]);
});

test('every catch-all name fails, in any directory and with any extension, unless it is in the ledger', () => {
  for (const name of GENERIC_NAMES) {
    const path = `src/deep/${name}.tsx`;
    expect(checkShape([{ path, text: lines(1) }], empty()).violations).toHaveLength(1);
    expect(checkShape([{ path, text: lines(1) }], { ...empty(), genericNames: [path] })).toEqual({
      violations: [],
      stale: [],
    });
  }
  expect(checkShape([{ path: 'src/order_utils.ts', text: lines(1) }], empty()).violations).toEqual([]);
  expect(checkShape([{ path: 'src/vite.config.ts', text: lines(1) }], empty()).violations).toEqual([]);
});

test('the ledger lets an old long file stay but never grow', () => {
  const ledger: Ledger = { ...empty(), longFiles: { 'src/old.ts': 1000 } };
  expect(checkShape([{ path: 'src/old.ts', text: lines(1000) }], ledger)).toEqual({ violations: [], stale: [] });
  expect(checkShape([{ path: 'src/old.ts', text: lines(1001) }], ledger).violations).toEqual([
    'src/old.ts: 1001 lines; the limit is 1000 (its ledger entry)',
  ]);
});

test('the ledger lets old long lines stay but never grow', () => {
  const long = 'y'.repeat(MAX_LINE_CHARS + 1) + '\n';
  const ledger: Ledger = { ...empty(), longLines: { 'src/old.ts': 2 } };
  expect(checkShape([{ path: 'src/old.ts', text: long + long }], ledger)).toEqual({ violations: [], stale: [] });
  expect(checkShape([{ path: 'src/old.ts', text: long + long + long }], ledger).violations).toEqual([
    `src/old.ts: 3 lines over ${MAX_LINE_CHARS} characters; 2 allowed (its ledger entry)`,
  ]);
});

test('an entry that is now too high, or not needed, or for a file that is gone, is stale and must be lowered', () => {
  const long = 'y'.repeat(MAX_LINE_CHARS + 1) + '\n';
  const ledger: Ledger = {
    longFiles: { 'src/shrunk.ts': 1000, 'src/fixed.ts': 900, 'src/gone.ts': 900 },
    longLines: { 'src/shrunk.ts': 3, 'src/fixed.ts': 1 },
    genericNames: ['src/utils.ts', 'src/missing_utils.ts'],
  };
  const files = [
    { path: 'src/shrunk.ts', text: lines(900) + long },
    { path: 'src/fixed.ts', text: lines(10) },
    { path: 'src/utils.ts', text: lines(1) },
  ];
  const { violations, stale } = checkShape(files, ledger);
  expect(violations).toEqual([]);
  expect(stale).toContain('src/shrunk.ts: now 901 lines; lower its longFiles entry from 1000');
  expect(stale).toContain(`src/shrunk.ts: now 1 lines over ${MAX_LINE_CHARS}; lower its longLines entry from 3`);
  expect(stale).toContain(`src/fixed.ts: now 10 lines, within ${MAX_FILE_LINES}; remove its longFiles entry`);
  expect(stale).toContain(
    `src/fixed.ts: no line over ${MAX_LINE_CHARS} characters any more; remove its longLines entry`,
  );
  expect(stale.some((entry) => entry.startsWith('src/gone.ts:'))).toBe(true);
  expect(stale.some((entry) => entry.startsWith('src/missing_utils.ts:'))).toBe(true);
});

test('tighten lowers and removes entries, never raises or adds one', () => {
  const long = 'y'.repeat(MAX_LINE_CHARS + 1) + '\n';
  const ledger: Ledger = {
    longFiles: { 'src/shrunk.ts': 1000, 'src/fixed.ts': 900 },
    longLines: { 'src/shrunk.ts': 3, 'src/grew.ts': 1 },
    genericNames: ['src/utils.ts', 'src/gone_utils.ts'],
  };
  const files = [
    { path: 'src/shrunk.ts', text: lines(900) + long },
    { path: 'src/fixed.ts', text: lines(10) },
    { path: 'src/grew.ts', text: long + long + long },
    { path: 'src/new.ts', text: lines(2000) + long },
    { path: 'src/utils.ts', text: lines(1) },
  ];
  expect(tighten(files, ledger)).toEqual({
    longFiles: { 'src/shrunk.ts': 901 },
    longLines: { 'src/shrunk.ts': 1, 'src/grew.ts': 1 },
    genericNames: ['src/utils.ts'],
  });
});
