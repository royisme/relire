#!/usr/bin/env bun
/** Executable fake dispatch for invented TEST readers only; never calls AI or a service. */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const [directory, model, taskFile, log, limit] = Bun.argv.slice(2);
const root = import.meta.dir;
const { modes, output } = await Bun.file(join(root, 'dispatch-fixture.json')).json();
const callsFile = Bun.file(join(root, 'calls.json'));
const calls = (await callsFile.exists()) ? await callsFile.json() : [];
const mode = modes[Math.min(calls.length, modes.length - 1)];
const task = await Bun.file(taskFile).text();
const schema = await Bun.file(join(directory, 'schema.json')).json();
calls.push({
  temporary: directory,
  model,
  taskFile,
  log,
  limit,
  task,
  files: (await readdir(directory)).sort(),
  properties: Object.keys(schema.properties).sort(),
  envClean: !Object.keys(process.env).some(
    (name) => name === 'GRAMMAR_REFERENCE_DIR' || /KEY|TOKEN|SECRET/i.test(name),
  ),
});
await Bun.write(callsFile, JSON.stringify(calls));
await Bun.write(log, 'TEST fake dispatch log');
console.error('TEST fake dispatch stderr');
if (mode === 'timeout') await Bun.sleep(60_000);
if (mode === 'none') process.exit(0);
if (mode === 'watchdog') process.exit(124);
if (mode === 'schema') delete output.body;
if (mode === 'identity') output.body.order = 12;
if (mode === 'provenance') output.provenance = { origin: 'TEST untrusted' };

function unnormalize(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    const french = [
      'fr',
      'lemma',
      'forms',
      'quote',
      'prompt',
      'expectedAnswer',
      'acceptableAnswers',
      'answer',
    ].includes(key);
    return french ? value.normalize('NFD').replace(/’/g, "'") : value;
  }
  if (Array.isArray(value)) return value.map((item) => unnormalize(item, key));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, unnormalize(item, name)]));
  return value;
}
await Bun.write(
  join(directory, 'out/draft.json'),
  mode === 'json' ? '{TEST bad JSON' : JSON.stringify(mode === 'normalize' ? unnormalize(output) : output),
);
// A nonzero process must be rejected even if it leaves a valid-looking artifact.
if (mode === 'dispatch') process.exit(23);
