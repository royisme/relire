/** Guards the serving-time schema budget and local occurrence validation, without API calls.
 * Run with `bun scripts/check-prosody-schema.ts`.
 */
import assert from 'node:assert/strict';
import { prosodyRequest } from '../src/services/ai/prompts';
import { validatePronunciationMarkers } from '../src/utils/pronunciationMarkers';

let failures = 0;
let checks = 0;
function check(name: string, run: () => void) {
  checks++;
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const baseline = JSON.stringify(prosodyRequest({ source: '' }, 'en').jsonSchema);
for (const words of [0, 1, 2, 11, 32, 60, 61, 250]) {
  for (const lang of ['en', 'zh'] as const) {
    check(`schema stays fixed for ${words} words (${lang})`, () => {
      const request = prosodyRequest({ source: Array(words).fill('mot').join(' ') }, lang);
      assert.equal(JSON.stringify(request.jsonSchema), baseline);
    });
  }
}

const schema = prosodyRequest({ source: Array(32).fill('mot').join(' ') }, 'en').jsonSchema;
const bounded = new Set(['minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format', 'prefixItems']);
function walk(value: unknown, path = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!bounded.has(key), `serving-time constraint at ${path}.${key}`);
      if (key === 'enum') {
        assert.ok(Array.isArray(child) && child.length <= 2, `expanding enum at ${path}`);
        assert.ok(/\.(version|status|type)$/.test(path), `index enum at ${path}`);
      }
      walk(child, `${path}.${key}`);
    }
  }
}
check('schema has no array/range bounds or occurrence enums', () => walk(schema));
check('schema retains the complete required annotation structure', () => {
  assert.ok(schema);
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['version', 'source', 'words', 'connections', 'stress']);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  for (const [name, fields] of [
    ['words', ['ordinal', 'source', 'status', 'ipa', 'boundaries', 'silent']],
    ['connections', ['left', 'right', 'type', 'sound', 'pronounced']],
    ['stress', ['word', 'syllable', 'anchor']],
  ] as const) {
    assert.equal(properties[name].type, 'array');
    const item = properties[name].items as Record<string, unknown>;
    assert.equal(item.type, 'object');
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, fields);
  }
});

const source = 'Je lis.';
const word = (ordinal: number, written: string) => ({
  ordinal, source: written, status: 'unresolved', ipa: [], boundaries: [], silent: [],
});
const answer = { version: 1, source, words: [word(0, 'Je'), word(1, 'lis')], connections: [], stress: [] };
check('local validator accepts exactly the canonical occurrences', () => {
  assert.equal(validatePronunciationMarkers(answer, source).words.length, 2);
});
for (const [name, bad] of [
  ['missing word', { ...answer, words: [word(0, 'Je')] }],
  ['extra word', { ...answer, words: [...answer.words, word(2, 'absent')] }],
  ['duplicate ordinal', { ...answer, words: [word(0, 'Je'), word(0, 'Je')] }],
  ['out-of-range ordinal', { ...answer, words: [word(0, 'Je'), word(2, 'lis')] }],
  ['changed source', { ...answer, source: 'Je parle.' }],
  ['wrong occurrence spelling', { ...answer, words: [word(0, 'Je'), word(1, 'parle')] }],
  ['out-of-range silence', { ...answer, words: [{ ...word(0, 'Je'), status: 'resolved', ipa: ['ʒə'], silent: [{ start: 2, end: 3 }] }, word(1, 'lis')] }],
] as const) {
  check(`local validator rejects ${name}`, () => {
    assert.throws(() => validatePronunciationMarkers(bad, source));
  });
}
console.log(`${checks - failures}/${checks} checks passed`);
process.exitCode = failures ? 1 : 0;
