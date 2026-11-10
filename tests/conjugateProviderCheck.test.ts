/** Owns the check script's classification, redaction, key lookup, table and dry-run text; no provider is called. */
import { describe, expect, test } from 'bun:test';
import {
  CASES,
  classifyAnswer,
  describePlan,
  formatTable,
  keyVariable,
  parseArgs,
  planProviders,
  redact,
  runVerb,
  type RunRecord,
} from '../scripts/grammar-pack/check-conjugate-providers';
import { parseJsonAnswer } from '../src/services/ai/answerJson';
import type { TextExecution } from '../src/services/ai/types';
import { verifyAnswer } from '../src/services/conjugation/verify';
import { parlerAnswer } from './fixtures/conjugationAnswer';

/** Stands in for a provider: the answer text goes through the same JSON parser every provider uses. */
const executionReturning = (text: string): TextExecution => ({
  model: 'mock-model',
  supportsAudioInput: false,
  imageInput: 'unknown',
  async generateJson<T>() {
    return parseJsonAnswer<T>(text);
  },
});

const executionFailing = (message: string): TextExecution => ({
  model: 'mock-model',
  supportsAudioInput: false,
  imageInput: 'unknown',
  async generateJson<T>(): Promise<T> {
    throw new Error(message);
  },
});

const SECRET = 'sk-test-4f9a2c';

describe('one run of the app path', () => {
  test('a canned good answer is ok and carries no preview', async () => {
    const result = await runVerb(executionReturning(JSON.stringify(parlerAnswer())), 'parler', [SECRET]);
    expect(result.classification).toEqual({ kind: 'ok', status: 'rule-checked' });
    expect(result.answerPreview).toBe('');
  });

  test('an answer that is not JSON is a JSON failure', async () => {
    const result = await runVerb(executionReturning('Voici la conjugaison de parler.'), 'parler', [SECRET]);
    expect(result.classification.kind).toBe('json');
    expect(result.answerPreview).toBe('');
  });

  test('an answer that breaks the schema reports the first issue, after the apostrophe fold', async () => {
    // The prefix is a straight apostrophe, which the task folds, so the pronominal claim passes; the
    // auxiliary a pronominal verb requires is then the real failure the schema reports.
    const answer = { ...parlerAnswer(), infinitive: "s'appeler", pronominal: true };
    const result = await runVerb(executionReturning(JSON.stringify(answer)), 'parler', [SECRET]);
    expect(result.classification.kind).toBe('schema');
    expect(result.classification.kind === 'schema' && result.classification.issue).toStartWith('aux: ');
    expect(result.answerPreview.length).toBeLessThanOrEqual(300);
  });

  test('a form the engine derives otherwise is an engine disagreement with its cells and tenses', async () => {
    const answer = parlerAnswer();
    answer.forms.imparfait['1sg'] = ['parlait'];
    const result = await runVerb(executionReturning(JSON.stringify(answer)), 'parler', [SECRET]);
    expect(result.classification).toEqual({
      kind: 'engine',
      cells: 1,
      tenses: ['imparfait'],
      participles: [],
      status: 'partly-differs',
    });
    expect(result.answerPreview).toContain('parlait');
  });

  test('a wrong participle is an engine disagreement with no differing cell', async () => {
    const answer = parlerAnswer();
    answer.participles.past.fs = 'parler';
    const result = await runVerb(executionReturning(JSON.stringify(answer)), 'parler', [SECRET]);
    expect(result.classification).toEqual({
      kind: 'engine',
      cells: 0,
      tenses: [],
      participles: ['fs'],
      status: 'partly-differs',
    });
  });

  test('a thrown network error is a request failure with the key redacted', async () => {
    const result = await runVerb(executionFailing(`fetch failed: Authorization: Bearer ${SECRET}`), 'parler', [SECRET]);
    expect(result.classification.kind).toBe('request');
    const message = result.classification.kind === 'request' ? result.classification.message : '';
    expect(message).not.toContain(SECRET);
    expect(message).toContain('[redacted]');
  });
});

describe('classification of a verified answer', () => {
  test('an ai-only answer is ok, because nothing independent exists to disagree with', () => {
    const answer = { ...parlerAnswer(), rule: 'er-cer' as const };
    expect(classifyAnswer(verifyAnswer(answer))).toEqual({ kind: 'ok', status: 'ai-only' });
  });
});

describe('key lookup and the plan', () => {
  test('a provider id becomes its environment variable name, hyphen included', () => {
    expect(keyVariable('openai')).toBe('RELIRE_KEY_OPENAI');
    expect(keyVariable('fish-audio')).toBe('RELIRE_KEY_FISH_AUDIO');
  });

  test('only providers whose key variable is set run; the rest are skipped with their reason', () => {
    const plan = planProviders({ RELIRE_KEY_OPENAI: SECRET });
    expect(plan.runs).toEqual([{ id: 'openai', model: 'gpt-4o-mini', key: SECRET }]);
    const skipped = Object.fromEntries(plan.skipped.map(({ id, reason }) => [id, reason]));
    expect(skipped.gemini).toBe('RELIRE_KEY_GEMINI is not set');
    expect(skipped.anthropic).toBe('RELIRE_KEY_ANTHROPIC is not set');
    // A local provider needs no key, so this check never asks it for one.
    expect(skipped.ollama).toBeUndefined();
    expect(plan.runs.map(({ id }) => id)).not.toContain('ollama');
  });

  test('the model and endpoint overrides are read, and a named provider outside the registry is skipped', () => {
    const plan = planProviders(
      {
        RELIRE_KEY_OPENAI: SECRET,
        RELIRE_MODEL_OPENAI: 'gpt-4.1',
        RELIRE_BASEURL_OPENAI: 'https://gateway.test/v1/',
      },
      ['openai', 'device'],
    );
    expect(plan.runs).toEqual([{ id: 'openai', model: 'gpt-4.1', baseUrl: 'https://gateway.test/v1', key: SECRET }]);
    expect(plan.skipped).toEqual([{ id: 'device', reason: 'not a registered text provider that needs a key' }]);
  });
});

describe('redaction', () => {
  test('every key value is replaced, in an error string and in a header-like string', () => {
    expect(redact(`401 Unauthorized for key ${SECRET}`, [SECRET])).toBe('401 Unauthorized for key [redacted]');
    expect(redact(`x-api-key: ${SECRET}`, [SECRET])).toBe('[redacted]');
    expect(redact('Authorization: Bearer abc123', [])).toBe('[redacted]');
    expect(redact('x-goog-api-key=abc123', [])).toBe('[redacted]');
    expect(redact('a plain provider error', [SECRET])).toBe('a plain provider error');
  });
});

describe('the plan and the table', () => {
  test('--dry-run output names the model and the cases, and never a key', () => {
    const plan = planProviders({ RELIRE_KEY_OPENAI: SECRET, RELIRE_KEY_ANTHROPIC: 'another-secret' }, ['openai']);
    const output = describePlan(plan, 5);
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain('another-secret');
    expect(output).toContain('openai  model gpt-4o-mini');
    expect(output).toContain('Repeat: 5');
    expect(output).toContain('parler, prendre, se lever, haïr');
    expect(output).toContain('Skipped: nothing');
  });

  test('the table counts each failure kind per provider, model and verb', () => {
    const records: RunRecord[] = [
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        verb: 'parler',
        ms: 10,
        classification: { kind: 'ok', status: 'rule-checked' },
      },
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        verb: 'parler',
        ms: 11,
        classification: { kind: 'schema', issue: 'aux: bad' },
      },
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        verb: 'parler',
        ms: 12,
        classification: { kind: 'engine', cells: 2, tenses: ['futur'], participles: [], status: 'partly-differs' },
      },
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        verb: 'haïr',
        ms: 13,
        classification: { kind: 'request', message: 'timeout' },
      },
    ];
    const lines = formatTable(records).split('\n');
    expect(lines[0]).toStartWith('provider  model');
    expect(lines[1].split(/\s{2,}/)).toEqual(['openai', 'gpt-4o-mini', 'parler', '3', '1', '0', '0', '1', '1']);
    expect(lines[2].split(/\s{2,}/)).toEqual(['openai', 'gpt-4o-mini', 'haïr', '1', '0', '1', '0', '0', '0']);
  });
});

test('the case list holds a regular, an irregular, a pronominal and an h-initial verb', () => {
  expect(CASES).toEqual(['parler', 'prendre', 'se lever', 'haïr']);
});

test('the flags parse, with defaults and a providers list', () => {
  expect(parseArgs([])).toEqual({ providers: [], repeat: 3, dryRun: false, help: false });
  expect(parseArgs(['--providers', 'openai, gemini', '--repeat', '2', '--dry-run'])).toEqual({
    providers: ['openai', 'gemini'],
    repeat: 2,
    dryRun: true,
    help: false,
  });
  expect(() => parseArgs(['--repeat', '0'])).toThrow('--repeat needs a whole number from 1');
  expect(() => parseArgs(['--providers'])).toThrow('--providers needs a value');
  expect(() => parseArgs(['--verbose'])).toThrow('Unknown argument: --verbose');
});
