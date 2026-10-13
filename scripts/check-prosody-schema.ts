/** Guards the serving-time schema budget and local occurrence validation, without API calls.
 * Run with `bun scripts/check-prosody-schema.ts`.
 */
import assert from 'node:assert/strict';
import { prosodyRequest } from '../src/services/ai/prompts';
import { validatePronunciationMarkers } from '../src/utils/pronunciationMarkers';
import { parseProsodyResponse } from '../src/utils/prosodyResponse';
import { FUNCTION_WORDS } from '../src/utils/functionWords';

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
  assert.deepEqual(schema.required, ['words', 'connections']);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  for (const [name, fields] of [
    ['words', ['ordinal', 'source', 'status', 'syllables', 'groupEnd']],
    ['connections', ['left', 'type', 'sound', 'spelling']],
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
] as const) {
  check(`local validator rejects ${name}`, () => {
    assert.throws(() => validatePronunciationMarkers(bad, source));
  });
}
check('local validator demotes a word with out-of-range silence, not the sentence', () => {
  const bad = { ...answer, words: [{ ...word(0, 'Je'), status: 'resolved', ipa: ['ʒə'], silent: [{ start: 2, end: 3 }] }, word(1, 'lis')] };
  assert.equal(validatePronunciationMarkers(bad, source).words[0].status, 'unresolved');
});

// Spelling-based provider answers: ranges are derived locally, word errors stay local.
const sentence = 'Le petit garçon porte les amis.';
type Syllable = [spelling: string, ipa: string];
const said = (ordinal: number, written: string, syllables: Syllable[] | null, groupEnd = false) => ({
  ordinal, source: written, status: syllables ? 'resolved' : 'unresolved',
  syllables: (syllables ?? []).map(([spelling, ipa]) => ({ spelling, ipa })), groupEnd,
});
const reply = (overrides: Record<number, ReturnType<typeof said>> = {}, connections: unknown[] = []) => ({
  words: [
    said(0, 'Le', [['Le', 'lə']]),
    said(1, 'petit', [['pe', 'pə'], ['ti(t)', 'ti']]),
    said(2, 'garçon', [['gar', 'gaʁ'], ['çon', 'sɔ̃']], true),
    said(3, 'porte', [['port(e)', 'pɔʁt']]),
    said(4, 'les', [['le(s)', 'le']]),
    said(5, 'amis', [['a', 'a'], ['mi(s)', 'mi']], true),
  ].map((word) => overrides[word.ordinal] ?? word),
  connections,
});
const parsed = (value: unknown) => parseProsodyResponse(value, sentence);
check('spelling answer becomes boundaries, silence and group-final stress', () => {
  const result = parsed(reply({}, [{ left: 4, type: 'liaison', sound: 'z', spelling: 's' }]));
  assert.deepEqual(result.words[1].boundaries, [2]);
  assert.deepEqual(result.words[1].silent, [{ start: 4, end: 5 }]);
  assert.deepEqual(result.words[3].silent, [{ start: 4, end: 5 }]);
  assert.deepEqual(result.stress.map((mark) => [mark.word, mark.syllable]), [[2, 1], [5, 1]]);
  assert.deepEqual(result.stress[1].anchor, { start: 1, end: 3 });
  assert.deepEqual(result.connections[0].pronounced, { start: 2, end: 3 });
  assert.deepEqual(result.words[4].silent, []);
});
check('le from the function-word table ignores a stray model boundary', () => {
  const result = parsed(reply({ 0: said(0, 'Le', [['L', 'lə'], ['e', 'lə']]) }));
  assert.equal(result.words[0].status, 'resolved');
  assert.deepEqual(result.words[0].boundaries, []);
});
check('a silent e in a schwa syllable (je /ʒə/) demotes only that word', () => {
  const source = 'Je pense.';
  const result = parseProsodyResponse({
    words: [said(0, 'Je', null), said(1, 'pense', [['pens(e)', 'pɑ̃s']], true)], connections: [],
  }, source);
  assert.equal(result.words[0].status, 'resolved');
  const marked = validatePronunciationMarkers({ ...result, words: [{ ...result.words[0], silent: [{ start: 1, end: 2 }] }, result.words[1]] }, source);
  assert.equal(marked.words[0].status, 'unresolved');
  assert.equal(marked.words[1].status, 'resolved');
});
check('a misspelled syllable demotes the word, keeps the sentence', () => {
  const result = parsed(reply({ 3: said(3, 'porte', [['por', 'pɔʁ'], ['tt(e)', 't']], true) }));
  assert.equal(result.words[3].status, 'unresolved');
  assert.equal(result.words[2].status, 'resolved');
  assert.ok(!result.stress.some((mark) => mark.word === 3));
});
check('a connection the left word cannot spell is dropped alone', () => {
  const result = parsed(reply({}, [{ left: 4, type: 'liaison', sound: 'z', spelling: 'x' }]));
  assert.equal(result.connections.length, 0);
  assert.equal(result.words.filter((word) => word.status === 'resolved').length, 6);
});
check('surplus, duplicate and out-of-range connections are dropped alone', () => {
  const link = (left: number) => ({ left, type: 'liaison', sound: 'z', spelling: 's' });
  const result = parsed(reply({}, [link(4), link(4), link(5), link(9), ...Array(8).fill(link(4))]));
  assert.equal(result.connections.length, 1);
  const single = parseProsodyResponse({ words: [said(0, 'Bonjour', [['bon', 'bɔ̃'], ['jour', 'ʒuʁ']], true)], connections: [link(0)] }, 'Bonjour.');
  assert.equal(single.connections.length, 0);
});
check('function-word table overrides an unresolved model answer', () => {
  const result = parsed(reply({ 4: said(4, 'les', null) }));
  assert.equal(result.words[4].status, 'resolved');
  assert.deepEqual(result.words[4].silent, [{ start: 2, end: 3 }]);
});
check('every function-word entry validates as a resolved word', () => {
  for (const word of Object.keys(FUNCTION_WORDS)) {
    const result = parseProsodyResponse({ words: [said(0, word, null)], connections: [] }, word);
    assert.equal(result.words[0].status, 'resolved', word);
  }
});
for (const [name, bad] of [
  ['missing word', { ...reply(), words: reply().words.slice(1) }],
  ['shifted word', reply({ 1: said(1, 'garçon', [['gar', 'gaʁ'], ['çon', 'sɔ̃']]) })],
  ['extra field', { ...reply(), stress: [] }],
] as const) {
  check(`spelling parser rejects ${name}`, () => {
    assert.throws(() => parsed(bad));
  });
}
console.log(`${checks - failures}/${checks} checks passed`);
process.exitCode = failures ? 1 : 0;
