import { expect, test } from 'bun:test';
import bundledThemes from '../src/data/themes/themes.json';
import { pickRoundSpec } from '../src/services/atelier/spec';
import { TaskIdSchema, ThemesSchema, type ThemeId } from '../src/types/themes';

const themes = ThemesSchema.parse(bundledThemes);

// Work has six subtopics; these are positions 0, 3 and 5, then the same draws in their task lists.
test.each([
  [0, 'job-search-hiring', 'oral-1'],
  [0.5, 'career-development', 'written-2'],
  [0.999999, 'employment-demographics', 'written-3'],
] as const)('theme only: random %s picks %s / %s', (coin, subtopicId, taskId) => {
  const spec = pickRoundSpec(themes, { themeId: 'work' }, () => coin);
  expect(spec.theme).toBe(themes.find((theme) => theme.id === 'work')!);
  expect(spec.subtopic.id).toBe(subtopicId);
  expect(spec.taskId).toBe(taskId);
  expect(spec.subtopic.tasks).toContain(taskId);
  expect(spec.example).toEqual(spec.theme.examples[taskId]);
});

// Only job search and workplace relationships in work list oral-2; the other four must be excluded.
test.each([
  [0, 'job-search-hiring'],
  [0.5, 'workplace-relationships'],
  [0.999999, 'workplace-relationships'],
] as const)('theme + task: random %s picks eligible %s', (coin, subtopicId) => {
  const spec = pickRoundSpec(themes, { themeId: 'work', taskId: 'oral-2' }, () => coin);
  expect(spec.subtopic.id).toBe(subtopicId);
  expect(spec.taskId).toBe('oral-2');
  expect(spec.subtopic.tasks).toContain('oral-2');
  expect(spec.example).toEqual(spec.theme.examples['oral-2']);
});

// Renting's task list is oral-2, written-1, oral-3 (not enum order).
test.each([
  [0, 'oral-2'],
  [0.5, 'written-1'],
  [0.999999, 'oral-3'],
] as const)('theme + subtopic: random %s picks %s', (coin, taskId) => {
  const spec = pickRoundSpec(themes, { themeId: 'housing', subtopicId: 'renting-accommodation' }, () => coin);
  expect(spec.subtopic.id).toBe('renting-accommodation');
  expect(spec.taskId).toBe(taskId);
  expect(spec.subtopic.tasks).toContain(taskId);
  expect(spec.example).toEqual(spec.theme.examples[taskId]);
});

test('an explicit theme, subtopic and task are returned without drawing', () => {
  const spec = pickRoundSpec(
    themes,
    { themeId: 'housing', subtopicId: 'renting-accommodation', taskId: 'written-1' },
    () => {
      throw new Error('No random choice is needed');
    },
  );
  const theme = themes.find((entry) => entry.id === 'housing')!;
  expect(spec).toEqual({
    theme,
    subtopic: theme.subtopics[0],
    taskId: 'written-1',
    example: theme.examples['written-1'],
  });
});

test('an unknown theme throws RangeError naming the id', () => {
  const pick = () => pickRoundSpec(themes, { themeId: 'missing-theme' as ThemeId }, () => 0);
  expect(pick).toThrow(RangeError);
  expect(pick).toThrow('missing-theme');
});

test.each(['missing-subtopic', 'renting-accommodation'])(
  'work rejects missing or foreign subtopic %s',
  (subtopicId) => {
    const pick = () => pickRoundSpec(themes, { themeId: 'work', subtopicId }, () => 0);
    expect(pick).toThrow(RangeError);
    expect(pick).toThrow(subtopicId);
  },
);

test('an explicit subtopic must list the explicit task', () => {
  const pick = () =>
    pickRoundSpec(themes, { themeId: 'work', subtopicId: 'ways-of-working', taskId: 'oral-2' }, () => 0);
  expect(pick).toThrow(RangeError);
  expect(pick).toThrow('ways-of-working does not list task oral-2');
});

test('every bundled theme covers every task at both ends of the filtered pool', () => {
  for (const theme of themes)
    for (const taskId of TaskIdSchema.options)
      for (const coin of [0, 0.999999]) {
        const spec = pickRoundSpec(themes, { themeId: theme.id, taskId }, () => coin);
        expect(spec.theme).toBe(theme);
        expect(theme.subtopics).toContain(spec.subtopic);
        expect(spec.taskId).toBe(taskId);
        expect(spec.subtopic.tasks, `${theme.id} / ${taskId} / ${coin}`).toContain(taskId);
        expect(spec.example).toEqual(theme.examples[taskId]);
      }
});
