/** Owns schema-request and rejection assertions for AI task tests, not provider fixtures or task cases. */
import { expect } from 'bun:test';

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

export const expectSchemaSent = (request: { jsonSchema?: Record<string, unknown> }) => {
  expect(request.jsonSchema).toBeDefined();
  expect(request.jsonSchema!.type).toBe('object');
  expect(keysOf(request.jsonSchema).has('const')).toBe(false);
  expect(JSON.stringify(request.jsonSchema)).not.toContain('"const"');
};

export const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the task to throw');
};
