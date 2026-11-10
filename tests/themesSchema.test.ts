/** Pins the bundled taxonomy contract and its English/Chinese locale keys. */
import { expect, test } from 'bun:test';
import data from '../src/data/themes/themes.json';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { TaskIdSchema, ThemeIdSchema, ThemesSchema } from '../src/types/themes';

test('the bundled taxonomy parses with 12 ordered themes, 69 subtopics and every task in every theme', () => {
  const themes = ThemesSchema.parse(data);
  expect(themes).toHaveLength(12);
  expect(themes.map((theme) => theme.id)).toEqual([
    'personal',
    'housing',
    'work',
    'education',
    'immigration',
    'travel',
    'shopping',
    'leisure',
    'health',
    'technology',
    'environment',
    'society',
  ]);
  expect(themes.map((theme) => theme.id)).toEqual(ThemeIdSchema.options);
  expect(themes.flatMap((theme) => theme.subtopics)).toHaveLength(69);
  expect(TaskIdSchema.options).toEqual(['oral-1', 'oral-2', 'oral-3', 'written-1', 'written-2', 'written-3']);
  for (const theme of themes) {
    expect(new Set(theme.subtopics.flatMap((subtopic) => subtopic.tasks))).toEqual(new Set(TaskIdSchema.options));
  }
});

test('a duplicate theme id is rejected at its second occurrence', () => {
  const bad = structuredClone(data);
  bad[1].id = bad[0].id;
  expect(ThemesSchema.safeParse(bad).error!.issues).toContainEqual(
    expect.objectContaining({ path: [1, 'id'], message: 'duplicate theme id personal, first at index 0' }),
  );
});

test('11 themes are rejected with the expected count', () => {
  const bad = structuredClone(data);
  bad.pop();
  expect(ThemesSchema.safeParse(bad).error!.issues).toContainEqual(
    expect.objectContaining({ path: [], message: 'expected 12 themes, got 11' }),
  );
});

test('an unknown theme id is rejected', () => {
  const bad = structuredClone(data);
  bad[0].id = 'unknown-theme';
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([0, 'id']);
});

test('a duplicate subtopic id within a theme is rejected', () => {
  const bad = structuredClone(data);
  bad[0].subtopics[1].id = bad[0].subtopics[0].id;
  expect(ThemesSchema.safeParse(bad).error!.issues).toContainEqual(
    expect.objectContaining({ path: [0, 'subtopics', 1, 'id'], message: 'duplicate subtopic id family-life' }),
  );
});

test('a duplicate subtopic id across two themes is rejected', () => {
  const bad = structuredClone(data);
  bad[1].subtopics[0].id = bad[0].subtopics[0].id;
  expect(ThemesSchema.safeParse(bad).error!.issues).toContainEqual(
    expect.objectContaining({ path: [1, 'subtopics', 0, 'id'], message: 'duplicate subtopic id family-life' }),
  );
});

test.each(['Renting', 'renting_x', 'renting-1'])('a non-kebab-case subtopic id %s is rejected', (id) => {
  const bad = structuredClone(data);
  bad[0].subtopics[0].id = id;
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([
    0,
    'subtopics',
    0,
    'id',
  ]);
});

test('an empty tasks list is rejected', () => {
  const bad = structuredClone(data);
  bad[0].subtopics[0].tasks = [];
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([
    0,
    'subtopics',
    0,
    'tasks',
  ]);
});

test('a duplicate task inside a subtopic is rejected', () => {
  const bad = structuredClone(data);
  const tasks = bad[0].subtopics[0].tasks;
  tasks.push(tasks[0]);
  expect(ThemesSchema.safeParse(bad).error!.issues).toContainEqual(
    expect.objectContaining({ path: [0, 'subtopics', 0, 'tasks', tasks.length - 1], message: 'duplicate task oral-1' }),
  );
});

test('an unknown task id is rejected', () => {
  const bad = structuredClone(data);
  bad[0].subtopics[0].tasks.push('unknown-task');
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([
    0,
    'subtopics',
    0,
    'tasks',
    4,
  ]);
});

test('a theme with no subtopic covering one task is rejected', () => {
  const bad = structuredClone(data);
  for (const subtopic of bad[0].subtopics) subtopic.tasks = subtopic.tasks.filter((task) => task !== 'oral-1');
  expect(ThemesSchema.safeParse(bad).error!.issues).toContainEqual(
    expect.objectContaining({ path: [0, 'subtopics'], message: 'personal has no subtopic for task oral-1' }),
  );
});

test('examples missing a task are rejected', () => {
  const bad = structuredClone(data);
  Reflect.deleteProperty(bad[0].examples, 'oral-1');
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([
    0,
    'examples',
    'oral-1',
  ]);
});

test.each(['fr', 'zh'] as const)('an example with blank %s is rejected', (language) => {
  const bad = structuredClone(data);
  bad[0].examples['oral-1'][language] = ' \t\n ';
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([
    0,
    'examples',
    'oral-1',
    language,
  ]);
});

test('a blank French theme name is rejected', () => {
  const bad = structuredClone(data);
  bad[0].fr = ' \t\n ';
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([0, 'fr']);
});

test('a blank French subtopic name is rejected', () => {
  const bad = structuredClone(data);
  bad[0].subtopics[0].fr = ' \t\n ';
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([
    0,
    'subtopics',
    0,
    'fr',
  ]);
});

test('a blank subtopic scope is rejected', () => {
  const bad = structuredClone(data);
  bad[0].subtopics[0].scope = ' \t\n ';
  expect(ThemesSchema.safeParse(bad).error!.issues.map((issue) => issue.path)).toContainEqual([
    0,
    'subtopics',
    0,
    'scope',
  ]);
});

for (const [language, locale] of [
  ['en', en],
  ['zh', zh],
] as const) {
  const themes: Record<string, { name: string; subtopics: Record<string, string> }> = locale.themes;

  test(`${language} has nonblank theme and subtopic names for every data id`, () => {
    for (const theme of data) {
      const labels = themes[theme.id];
      expect(typeof labels.name).toBe('string');
      expect(labels.name.trim().length).toBeGreaterThan(0);
      for (const subtopic of theme.subtopics) {
        const name = labels.subtopics[subtopic.id];
        expect(typeof name).toBe('string');
        expect(name.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test(`${language} theme and subtopic keys match the data exactly`, () => {
    expect(Object.keys(themes).sort()).toEqual(data.map((theme) => theme.id).sort());
    for (const theme of data) {
      expect(Object.keys(themes[theme.id]).sort()).toEqual(['name', 'subtopics']);
      expect(Object.keys(themes[theme.id].subtopics).sort()).toEqual(
        theme.subtopics.map((subtopic) => subtopic.id).sort(),
      );
    }
  });

  test(`${language} theme and subtopic names use the expected script`, () => {
    for (const theme of data) {
      const labels = themes[theme.id];
      for (const name of [labels.name, ...Object.values(labels.subtopics)]) {
        expect(/\p{Script=Han}/u.test(name)).toBe(language === 'zh');
      }
    }
  });
}
