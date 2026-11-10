/**
 * Theme-taxonomy contract: the Zod schemas of the bundled taxonomy
 * (`src/data/themes/themes.json`, derived from the owner-adopted
 * `docs/themes/themes.json`) and the invariants checked at load. The taxonomy
 * fixes the 12 practice themes, their 69 subtopics and the six TCF tasks every
 * practice item is drawn from (theme × subtopic × task). Ids are permanent:
 * saved attempts record them. Theme and subtopic labels are locale keys
 * `themes.<themeId>.name` and `themes.<themeId>.subtopics.<subtopicId>`, never
 * stored here; the French names, `scope` and `examples` are prompt material.
 */
import { z } from 'zod';

const text = z.string().trim().min(1);
const slug = z.string().regex(/^[a-z]+(-[a-z]+)*$/);

/** The 12 theme ids, in taxonomy order. */
export const ThemeIdSchema = z.enum([
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
export type ThemeId = z.infer<typeof ThemeIdSchema>;

/** The six TCF Canada expression tasks; each fixes the sentence type the AI generates. */
export const TaskIdSchema = z.enum(['oral-1', 'oral-2', 'oral-3', 'written-1', 'written-2', 'written-3']);
export type TaskId = z.infer<typeof TaskIdSchema>;

/** One generated-item example for a task: French prompt material, Chinese learner-facing gloss. */
export const ExampleSchema = z.object({ fr: text, zh: text });
export type Example = z.infer<typeof ExampleSchema>;

export const SubtopicSchema = z.object({
  /** Ascii slug, unique across the whole taxonomy. */
  id: slug,
  /** French name, prompt material. */
  fr: text,
  /** What the subtopic covers, in the generation prompt. */
  scope: text,
  /** The tasks the subtopic suits; no duplicates (checked on ThemesSchema). */
  tasks: z.array(TaskIdSchema).min(1),
});
export type Subtopic = z.infer<typeof SubtopicSchema>;

export const ThemeSchema = z.object({
  id: ThemeIdSchema,
  /** French name, prompt material. */
  fr: text,
  subtopics: z.array(SubtopicSchema).min(1),
  /** All six task ids, each with its example (nonblank on both sides). */
  examples: z.record(TaskIdSchema, ExampleSchema),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const ThemesSchema = z.array(ThemeSchema).superRefine((themes, ctx) => {
  const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

  // Every theme id exactly once: the ids are enum-restricted, so 12 slots without
  // a duplicate means each of the 12 appears.
  themes.forEach((theme, i) => {
    const first = themes.findIndex((other) => other.id === theme.id);
    if (first !== i) fail([i, 'id'], `duplicate theme id ${theme.id}, first at index ${first}`);
  });
  if (themes.length !== ThemeIdSchema.options.length) {
    fail([], `expected ${ThemeIdSchema.options.length} themes, got ${themes.length}`);
  }

  const seenSubtopics = new Set<string>();
  themes.forEach((theme, i) => {
    theme.subtopics.forEach((subtopic, j) => {
      if (seenSubtopics.has(subtopic.id)) fail([i, 'subtopics', j, 'id'], `duplicate subtopic id ${subtopic.id}`);
      seenSubtopics.add(subtopic.id);
      subtopic.tasks.forEach((task, k) => {
        if (subtopic.tasks.indexOf(task) !== k) fail([i, 'subtopics', j, 'tasks', k], `duplicate task ${task}`);
      });
    });
    const covered = new Set(theme.subtopics.flatMap((subtopic) => subtopic.tasks));
    for (const task of TaskIdSchema.options) {
      if (!covered.has(task)) fail([i, 'subtopics'], `${theme.id} has no subtopic for task ${task}`);
    }
  });
});
export type Themes = z.infer<typeof ThemesSchema>;
