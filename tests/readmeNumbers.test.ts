/** Pins the readme-numbers noun-gender rows to the committed pack, so a hard-coded count drifts into failure. */
import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import pack from '../src/data/noun-gender/pack.json';

const script = Bun.spawnSync({
  cmd: [process.execPath, 'scripts/readme-numbers.ts'],
  cwd: fileURLToPath(new URL('..', import.meta.url)),
});
const printed = new TextDecoder().decode(script.stdout).split('\n');

test('the readme-numbers script exits 0', () => {
  expect(script.exitCode).toBe(0);
});

for (const { ending, item } of [
  { ending: 'tion', item: 'Noun ending -tion, feminine in the dictionary' },
  { ending: 'age', item: 'Noun ending -age, masculine in the dictionary' },
  { ending: 'ure', item: 'Noun ending -ure, feminine in the dictionary' },
]) {
  test(`it prints "${item}" exactly once, with the pack's dictionary counts`, () => {
    const { agree, n } = pack.rules.find((rule) => rule.ending === ending)!.dictionary;
    expect(
      printed.filter((line) => line === `${item}: ${agree} of ${n} (src/data/noun-gender/pack.json)`),
    ).toHaveLength(1);
  });
}

test('it prints the pack-reviewed noun count exactly once', () => {
  const reviewed = pack.nouns.filter((noun) => noun.prov.status === 'reviewed').length;
  expect(
    printed.filter(
      (line) => line === `Reviewed nouns in the noun-gender pack: ${reviewed} (src/data/noun-gender/pack.json)`,
    ),
  ).toHaveLength(1);
});
