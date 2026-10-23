import { expect, test } from 'bun:test';
import { z } from 'zod';
import {
  drillsJsonSchema,
  exerciseJsonSchema,
  importDraftJsonSchema,
  toProviderJsonSchema,
} from '../src/services/exercises/jsonSchema';
import { ExerciseTypeSchema } from '../src/types/exercises';

/** Every key at any depth. */
function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const entry of value) keysOf(entry, found);
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) {
      found.add(key);
      keysOf(entry, found);
    }
  return found;
}

test('a literal becomes a singleton enum, not const', () => {
  const schema = toProviderJsonSchema(z.object({ status: z.literal('connected'), kind: z.literal(['a', 'b']) }));
  const props = (schema as { properties: Record<string, Record<string, unknown>> }).properties;
  expect(props.status).not.toHaveProperty('const');
  expect(props.status.enum).toEqual(['connected']);
  expect(props.kind.enum).toEqual(['a', 'b']);
});

test('the converted schema is plain JSON without Zod internals', () => {
  const schema = toProviderJsonSchema(z.object({ status: z.literal('connected') }));
  expect(Object.getOwnPropertyNames(schema)).not.toContain('~standard');
  expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
});

test('fields with defaults stay optional for the model', () => {
  const schema = toProviderJsonSchema(z.object({ a: z.string(), b: z.string().default('x') })) as {
    required: string[];
  };
  expect(schema.required).toEqual(['a']);
});

for (const [name, make] of [
  ['exercise', exerciseJsonSchema],
  ['drills', drillsJsonSchema],
  ['import draft', importDraftJsonSchema],
] as const) {
  test(`the ${name} schema contains no const and no Zod internals`, () => {
    const schema = make();
    const keys = keysOf(schema);
    expect(keys.has('const')).toBe(false);
    expect(keys.has('~standard')).toBe(false);
    expect(JSON.stringify(schema)).not.toContain('"const"');
    expect(schema.type).toBe('object');
  });
}

test('the exercise schema lists the 11 types and the grammar tags as enums', () => {
  const text = JSON.stringify(exerciseJsonSchema());
  for (const type of ExerciseTypeSchema.options) expect(text).toContain(`"${type}"`);
  expect(text).toContain('"passe-compose"');
  expect(text).not.toContain('gender-agreement');
});

test('the import draft schema lets a model leave answers null and omit draft-only fields', () => {
  const draft = importDraftJsonSchema() as {
    required?: string[];
    properties: {
      units: {
        items: { properties: { items: { items: { required: string[]; properties: Record<string, unknown> } } } };
      };
    };
  };
  expect(draft.required).toEqual(['units']);
  const item = draft.properties.units.items.properties.items.items;
  expect(item.required).toContain('expectedAnswer');
  expect(item.required).not.toContain('printedAnswer');
  expect(item.required).not.toContain('blockers');
  expect(JSON.stringify(item.properties.expectedAnswer)).toContain('"null"');
});
