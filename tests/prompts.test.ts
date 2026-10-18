import { expect, test } from 'bun:test';
import { renderTemplate, usedVariables } from '../src/services/ai/prompts/engine';
import { PROMPTS, type PromptId } from '../src/services/ai/prompts/registry';
import {
  DrillsSchema,
  ExplanationSchema,
  GeneratedExercisesSchema,
  HintSchema,
  OpenGradeSchema,
} from '../src/types/exerciseAi';
import { ImportDraftSchema } from '../src/services/exercises/importDraft';
import { TranscriptionSchema } from '../src/types/transcription';
import { ExerciseTypeSchema } from '../src/types/exercises';
import { GRAMMAR_TAGS } from '../src/types/grammar';

const NEW_IDS: PromptId[] = ['extract', 'transcribe', 'hint', 'explain', 'grade', 'adaptive', 'exercises'];
const definition = (id: PromptId) => PROMPTS.find((p) => p.id === id)!;
const blocks = (template: string) => [...template.matchAll(/\{\{#if [^}]+\}\}|\{\{\/if\}\}/g)].map((m) => m[0]);

test('the exercise and transcription prompts are registered', () => {
  for (const id of NEW_IDS) expect(definition(id)).toBeDefined();
  expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
});

for (const id of NEW_IDS) {
  for (const lang of ['en', 'zh'] as const) {
    test(`${id}.${lang} renders with its sample and leaves no template syntax behind`, () => {
      const def = definition(id);
      const out = renderTemplate(def.defaults[lang], def.sample);
      expect(out).not.toContain('{{');
      expect(out.trim().length).toBeGreaterThan(200);
      // Every sample value reaches the prompt (source and mode only select blocks).
      for (const [name, value] of Object.entries(def.sample))
        if (value && !['source', 'mode'].includes(name))
          expect(out, `${name} missing from ${id}.${lang}`).toContain(value);
    });
  }

  test(`${id}: both languages use the same variables and the same blocks`, () => {
    const def = definition(id);
    const en = usedVariables(def.defaults.en).sort();
    const zh = usedVariables(def.defaults.zh).sort();
    expect(zh).toEqual(en);
    // Declared variables are exactly the ones the templates use, so the editor shows no warnings.
    expect(en).toEqual([...def.variables].sort());
    expect(blocks(def.defaults.zh)).toEqual(blocks(def.defaults.en));
    expect(Object.keys(def.sample).sort()).toEqual([...def.variables].sort());
  });
}

test('optional blocks drop out when their variable is empty', () => {
  const hint = definition('hint');
  const withContext = renderTemplate(hint.defaults.en, hint.sample);
  const without = renderTemplate(hint.defaults.en, { ...hint.sample, context: '' });
  expect(withContext).toContain('Context from the lesson');
  expect(without).not.toContain('Context from the lesson');

  const adaptive = definition('adaptive');
  expect(renderTemplate(adaptive.defaults.zh, adaptive.sample)).toContain('近期错题（JSON');
  expect(renderTemplate(adaptive.defaults.zh, { ...adaptive.sample, recentMistakes: undefined })).not.toContain(
    '近期错题（JSON',
  );
});

test('extract picks its source and mode blocks', () => {
  const { defaults, sample } = definition('extract');
  const image = renderTemplate(defaults.en, { ...sample, source: 'image', rawText: '' });
  expect(image).toContain('The material is one or more images');
  expect(image).not.toContain('The material is pasted text');
  expect(image).not.toContain('The user pasted this material');
  const text = renderTemplate(defaults.en, { ...sample, source: 'text', mode: 'extract' });
  expect(text).toContain('The material is pasted text');
  expect(text).toContain('Extract only.');
  expect(text).not.toContain('Complete the material.');
  const generate = renderTemplate(defaults.zh, { ...sample, mode: 'generate' });
  expect(generate).toContain('生成新的练习');
});

test('no template narrows the learner to TCF reading and speaking', () => {
  for (const id of NEW_IDS)
    for (const lang of ['en', 'zh'] as const) {
      const text = definition(id).defaults[lang];
      expect(text).not.toMatch(/reading and speaking/i);
      expect(text).not.toContain('阅读与口语');
    }
});

/** Field names of a Zod object schema. */
const fieldsOf = (schema: { shape: Record<string, unknown> }) => Object.keys(schema.shape);

/** A template describes a field when it names it. */
function expectDescribes(id: PromptId, fields: string[], skip: string[] = []) {
  for (const lang of ['en', 'zh'] as const) {
    const text = definition(id).defaults[lang];
    for (const field of fields.filter((f) => !skip.includes(f)))
      expect(text, `${id}.${lang} does not describe "${field}"`).toMatch(new RegExp(`\\b${field}\\b`));
  }
}

test('transcribe describes the fields the transcription accepts and asks for nothing else', () => {
  expectDescribes('transcribe', fieldsOf(TranscriptionSchema));
  for (const lang of ['en', 'zh'] as const) {
    const text = definition('transcribe').defaults[lang];
    expect(text).not.toMatch(/\bsourceText\b/);
    expect(text).not.toMatch(/\bunits?\b/);
  }
});

test('extract describes exactly the fields the import draft accepts', () => {
  const draft = ImportDraftSchema as unknown as { shape: Record<string, never> };
  type Shape = { shape: Record<string, unknown> };
  const unit = (draft.shape.units as unknown as { element: Shape }).element;
  const item = (unit.shape.items as unknown as { element: Shape }).element;
  expectDescribes('extract', [...fieldsOf(draft), ...fieldsOf(unit), ...fieldsOf(item)]);
  // Fields the app owns, and names from the old shape, must not be asked for.
  for (const lang of ['en', 'zh'] as const) {
    const text = definition('extract').defaults[lang];
    expect(text).not.toContain('lessonTitle');
    expect(text).not.toMatch(/\banswerSource\b/);
    expect(text).not.toMatch(/\bmeta\b/);
    expect(text).not.toMatch(/\bimportSource\b/);
  }
});

test('exercises describes the units and items it is validated against, including articleQuote', () => {
  type Shape = { shape: Record<string, unknown> };
  const unit = (GeneratedExercisesSchema as unknown as { shape: { units: { element: Shape } } }).shape.units.element;
  const item = (unit.shape.items as unknown as { element: Shape }).element;
  expect(fieldsOf(item)).toContain('articleQuote');
  // Accepted but meaningless for units made from an article, so the prompt leaves them out.
  const notAsked = ['importSource', 'isExtracurricular', 'subPart', 'answerSource', 'meta'];
  expectDescribes('exercises', [...fieldsOf(unit), ...fieldsOf(item)], notAsked);
  for (const lang of ['en', 'zh'] as const) {
    const text = definition('exercises').defaults[lang];
    expect(text).toContain('"units"');
    for (const type of ExerciseTypeSchema.options) expect(text).toContain(type);
    for (const tag of GRAMMAR_TAGS) expect(text).toContain(tag);
  }
});

test('adaptive describes the drill fields, and dictation items carry audioText', () => {
  type Shape = { shape: Record<string, unknown> };
  const drills = DrillsSchema as unknown as { shape: Record<string, unknown> };
  const item = (drills.shape.items as unknown as { element: Shape }).element;
  expectDescribes('adaptive', [...Object.keys(drills.shape), ...fieldsOf(item)], ['answerSource', 'meta']);
  for (const lang of ['en', 'zh'] as const) {
    const text = definition('adaptive').defaults[lang];
    expect(text).toContain('NUMBER_DICTATION');
    expect(text).toMatch(/audioText/);
  }
});

test('hint, explain and grade name every field of their schema', () => {
  expectDescribes('hint', fieldsOf(HintSchema));
  expectDescribes('explain', fieldsOf(ExplanationSchema));
  expectDescribes('grade', fieldsOf(OpenGradeSchema));
});

test('grading asks for no numeric score', () => {
  expect(fieldsOf(OpenGradeSchema)).not.toContain('score');
  for (const lang of ['en', 'zh'] as const) expect(definition('grade').defaults[lang]).not.toMatch(/"score"/);
});
