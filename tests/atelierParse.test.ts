/** Boundary rejection cases start from a deep clone of a good, hand-written item. */
import { expect, test } from 'bun:test';
import { parseRound } from '../src/services/atelier/parse';
import type { AtelierItem } from '../src/types/atelier';
import { beach, cinema, coffee, negative } from './fixtures/atelier';

function expectDrop(item: unknown, ...offending: string[]) {
  const result = parseRound({ items: [item] });
  expect(result.items).toEqual([]);
  expect(result.dropped).toHaveLength(1);
  expect(result.dropped[0].index).toBe(0);
  for (const text of offending) expect(result.dropped[0].reason).toContain(text);
}

test('a good round passes through unchanged', () => {
  const items = structuredClone([beach, coffee, cinema]);
  expect(parseRound({ items })).toEqual({ items, dropped: [] });
});

test.each([null, 'not a round', {}, { items: 'not an array' }])(
  'an unusable round %j throws with the round error prefix',
  (raw) => {
    expect(() => parseRound(raw)).toThrow(/^The round was not usable:/);
  },
);

test('an empty round has neither items nor drops', () => {
  expect(parseRound({ items: [] })).toEqual({ items: [], dropped: [] });
});

test('schema failure names a blank brick text', () => {
  const bad = structuredClone(beach);
  bad.bricks[0].text = ' \t ';
  expectDrop(bad, 'bricks.0.text');
});

test('schema failure names the missing frame', () => {
  const bad = structuredClone(beach);
  Reflect.deleteProperty(bad, 'frame');
  expectDrop(bad, 'frame');
});

test('schema failure names zero distractors', () => {
  const bad = structuredClone(beach);
  bad.distractors = [];
  expectDrop(bad, 'distractors');
});

test('schema failure names an unknown brick role', () => {
  const bad = structuredClone(beach);
  Reflect.set(bad.bricks[0], 'role', 'interjection');
  expectDrop(bad, 'bricks.0.role');
});

test('a join mismatch names both the joined string and the supplied sentence', () => {
  const bad = structuredClone(beach);
  bad.sentence = 'Nous allons à la piscine.';
  expectDrop(bad, 'join', 'Nous allons à la plage.', 'Nous allons à la piscine.');
});

test('a no-break space before ? still differs from the punctuation join', () => {
  const good = structuredClone(beach);
  good.bricks[5].text = '?';
  good.sentence = 'Nous allons à la plage?';
  good.variants = [];
  expect(parseRound({ items: [good] })).toEqual({ items: [good], dropped: [] });
  const bad = structuredClone(good);
  bad.sentence = 'Nous allons à la plage\u00a0?';
  expectDrop(bad, 'join', 'Nous allons à la plage?', 'Nous allons à la plage ?');
});

test('a legal reordered variant is kept', () => {
  const good = structuredClone(beach);
  good.variants = ['À la plage nous allons.'];
  expect(parseRound({ items: [good] })).toEqual({ items: [good], dropped: [] });
});

test('a variant differing only in case is kept', () => {
  const good = structuredClone(beach);
  good.variants = ['nous allons à la plage.'];
  expect(parseRound({ items: [good] })).toEqual({ items: [good], dropped: [] });
});

test('a variant borrowing a distractor is dropped', () => {
  const bad = structuredClone(beach);
  bad.variants = ['Nous allons au la plage.'];
  expectDrop(bad, 'variant', 'Nous allons au la plage.');
});

test('a variant missing one brick is dropped', () => {
  const bad = structuredClone(beach);
  bad.variants = ['Nous allons à plage.'];
  expectDrop(bad, 'variant', 'Nous allons à plage.');
});

test('a distractor spelling a brick case-insensitively is dropped', () => {
  const bad = structuredClone(beach);
  bad.distractors[0].text = 'NOUS';
  expectDrop(bad, 'distractor', 'NOUS');
});

test('a distractor spelling a brick with a straight rather than typographic apostrophe is dropped', () => {
  const bad = structuredClone(coffee);
  bad.distractors[0].text = "J'";
  expectDrop(bad, 'distractor', "J'");
});

test('a frame verb index out of range is dropped', () => {
  const bad = structuredClone(beach);
  bad.frame.verb = 6;
  expectDrop(bad, 'frame verb index 6', 'out of range');
});

test('a frame verb pointing at a noun is dropped', () => {
  const bad = structuredClone(beach);
  // Keep the noun outside the socket so the verb-role check is the only violation.
  bad.frame.sockets[0].filledBy = [2, 3];
  expect(parseRound({ items: [bad] }).dropped).toEqual([]);
  bad.frame.verb = 4;
  expectDrop(bad, 'frame verb index 4', 'plage', 'noun');
});

test('a frame verb pointing at an auxiliary is kept', () => {
  const good: AtelierItem = {
    ...structuredClone(beach),
    meaning: { zh: '我们去了海滩。', en: 'We went to the beach.' },
    sentence: 'Nous sommes allés à la plage.',
    variants: [],
    bricks: [
      { text: 'Nous', role: 'subject' },
      { text: 'sommes', role: 'auxiliary' },
      { text: 'allés', role: 'verb' },
      { text: 'à', role: 'preposition' },
      { text: 'la', role: 'determiner' },
      { text: 'plage', role: 'noun' },
      { text: '.', role: 'punctuation' },
    ],
    frame: { verb: 1, sockets: [{ label: 'à + nom', filledBy: [3, 4, 5] }] },
    explanation: { zh: 'aller 的复合过去时用 être。', en: 'Aller uses être in the passé composé.' },
  };
  expect(parseRound({ items: [good] })).toEqual({ items: [good], dropped: [] });
});

test('a filledBy index out of range is dropped', () => {
  const bad = structuredClone(beach);
  bad.frame.sockets[0].filledBy = [2, 3, 6];
  expectDrop(bad, 'socket', 'à + nom', 'index 6', 'out of range');
});

test('a socket containing the frame verb index is dropped', () => {
  const bad = structuredClone(beach);
  bad.frame.sockets[0].filledBy = [1, 2, 3, 4];
  expectDrop(bad, 'socket', 'à + nom', 'verb brick');
});

test('a duplicate index inside one socket is dropped', () => {
  const bad = structuredClone(beach);
  bad.frame.sockets[0].filledBy = [2, 3, 4, 4];
  expectDrop(bad, 'socket', 'à + nom', 'same brick twice');
});

test('a modify whose bricks do not join to its sentence is dropped', () => {
  const bad = structuredClone(beach);
  bad.modify!.sentence = 'Nous n’allons pas à la piscine.';
  expectDrop(bad, 'modify', 'Nous n’allons pas à la plage.', 'Nous n’allons pas à la piscine.');
});

test('a modify identical to the original sentence is dropped', () => {
  const bad = structuredClone(beach);
  bad.modify!.sentence = 'Nous allons à la plage.';
  bad.modify!.bricks = structuredClone(beach.bricks);
  expectDrop(bad, 'modify', 'Nous allons à la plage.', 'changes nothing');
});

test('a valid elided negative modify is kept', () => {
  const good = structuredClone(beach);
  expect(parseRound({ items: [good] })).toEqual({ items: [good], dropped: [] });
  expect(good.modify).toEqual(negative);
});

test('join failure takes precedence over frame failure', () => {
  const bad = structuredClone(beach);
  bad.sentence = 'Nous allons à la piscine.';
  bad.frame.verb = 6;
  expectDrop(bad, 'join', 'Nous allons à la plage.', 'Nous allons à la piscine.');
  expect(parseRound({ items: [bad] }).dropped[0].reason).not.toContain('frame');
});

test('a mixed round keeps good items in order and reports original bad indexes', () => {
  const badJoin = structuredClone(beach);
  badJoin.sentence = 'Nous allons à la piscine.';
  const badFrame = structuredClone(coffee);
  badFrame.frame.verb = 5;
  const result = parseRound({ items: [structuredClone(beach), badJoin, structuredClone(cinema), badFrame] });
  expect(result.items).toEqual([beach, cinema]);
  expect(result.dropped).toEqual([
    { index: 1, reason: expect.stringContaining('Nous allons à la piscine.') },
    { index: 3, reason: expect.stringContaining('frame verb index 5') },
  ]);
});

test('an unknown extra item key is stripped without dropping the item', () => {
  const good = structuredClone(beach);
  Reflect.set(good, 'extra', 'TEST');
  const result = parseRound({ items: [good] });
  expect(result).toEqual({ items: [beach], dropped: [] });
  expect(result.items[0]).not.toHaveProperty('extra');
});
