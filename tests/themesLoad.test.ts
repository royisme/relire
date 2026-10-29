/** Pins whole-taxonomy loading, deep immutability, memoisation and retry after validation failure. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import data from '../src/data/themes/themes.json';
import { loadThemes, loadedThemes, resetThemesForTests } from '../src/services/themes/load';

beforeEach(resetThemesForTests);
afterEach(resetThemesForTests);

test('the bundled taxonomy resolves and is deeply frozen, including nested tasks', async () => {
  const themes = await loadThemes();
  expect(data).toEqual(themes);
  expect(Object.isFrozen(themes)).toBe(true);
  for (const theme of themes) {
    for (const object of [theme, theme.subtopics, theme.examples, ...Object.values(theme.examples)]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
    for (const subtopic of theme.subtopics) {
      expect(Object.isFrozen(subtopic)).toBe(true);
      expect(Object.isFrozen(subtopic.tasks)).toBe(true);
    }
  }
  // ES modules run in strict mode: frozen writes must throw, not silently fail.
  expect(() => {
    themes[0] = themes[1];
  }).toThrow(TypeError);
  expect(() => {
    themes[0].fr = 'changed';
  }).toThrow(TypeError);
  expect(() => {
    themes[0].subtopics[0].fr = 'changed';
  }).toThrow(TypeError);
  expect(() => {
    themes[0].subtopics[0].tasks[0] = 'oral-2';
  }).toThrow(TypeError);
  expect(() => themes[0].subtopics[0].tasks.push('oral-2')).toThrow(TypeError);
  expect(data).toEqual(themes);
});

test('concurrent and later calls return the same memoised taxonomy', async () => {
  expect(loadedThemes()).toBeUndefined();
  const first = loadThemes();
  expect(loadThemes()).toBe(first);
  const themes = await first;
  expect(await loadThemes()).toBe(themes);
  expect(loadedThemes()).toBe(themes);
});

test('reset clears the loaded taxonomy and the memoised load', async () => {
  const first = await loadThemes();
  expect(loadedThemes()).toBe(first);
  resetThemesForTests();
  expect(loadedThemes()).toBeUndefined();
  const next = await loadThemes();
  expect(next).not.toBe(first);
  expect(next).toEqual(first);
  expect(loadedThemes()).toBe(next);
});

test('malformed data rejects with its failing path and a later good load succeeds', async () => {
  const bad = structuredClone(data);
  bad[0].subtopics[0].scope = ' \t\n ';
  const first = loadThemes(bad);
  const message = await first.then(
    () => '',
    (error: Error) => error.message,
  );
  expect(message).toMatch(/^The theme taxonomy was not usable: 0\.subtopics\.0\.scope:/);
  expect(loadedThemes()).toBeUndefined();
  const retry = loadThemes(data);
  expect(retry).not.toBe(first);
  const themes = await retry;
  expect(data).toEqual(themes);
  expect(loadedThemes()).toBe(themes);
  expect(await loadThemes()).toBe(themes);
});
