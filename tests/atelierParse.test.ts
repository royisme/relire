/** Boundary rejection cases start from a deep clone of a good, hand-written item. */
import { expect, test } from 'bun:test';
import { parseRound } from '../src/services/atelier/parse';
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

test.each(['missing', 'empty'])('schema failure names %s links', (kind) => {
  const bad = structuredClone(beach);
  if (kind === 'missing') Reflect.deleteProperty(bad, 'links');
  if (kind === 'empty') bad.links = [];
  expectDrop(bad, 'links');
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

for (const target of ['item', 'modify'] as const) {
  for (const defect of ['head range', 'dependent range', 'self', 'duplicate'] as const) {
    test(`${target}: link ${defect} is dropped with the link's name`, () => {
      const bad = structuredClone(beach);
      const holder = target === 'item' ? bad : bad.modify!;
      const link = holder.links[0];
      if (defect === 'head range') link.head = holder.bricks.length;
      if (defect === 'dependent range') link.dependents = [holder.bricks.length];
      if (defect === 'self') link.dependents = [link.head];
      if (defect === 'duplicate') link.dependents = [0, 0];
      expectDrop(
        bad,
        'link',
        link.label,
        defect.includes('range') ? 'out of range' : defect === 'self' ? 'depend on itself' : 'same dependent twice',
      );
    });
  }
}

test('modify links use modify.bricks, not the shorter original list', () => {
  const good = structuredClone(beach);
  expect(good.modify!.links.some((link) => link.head >= good.bricks.length)).toBe(true);
  expect(parseRound({ items: [good] })).toEqual({ items: [good], dropped: [] });
});

test('an imperative needs no subject link', () => {
  const good = {
    ...structuredClone(coffee),
    meaning: { en: 'Like coffee.', zh: '喜欢咖啡吧。' },
    sentence: 'Aime le café.',
    bricks: coffee.bricks.slice(1).map((brick, i) => (i === 0 ? { ...brick, text: 'Aime' } : brick)),
    links: coffee.links
      .filter((link) => link.relation !== 'subject')
      .map((link) => ({ ...link, head: link.head - 1, dependents: link.dependents.map((index) => index - 1) })),
  };
  expect(parseRound({ items: [good] })).toEqual({ items: [good], dropped: [] });
});

test.each(['missing', 'empty'])('modify also requires %s links', (kind) => {
  const bad = structuredClone(beach);
  if (kind === 'missing') Reflect.deleteProperty(bad.modify!, 'links');
  if (kind === 'empty') bad.modify!.links = [];
  expectDrop(bad, 'modify.links');
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

test('join failure takes precedence over link failure', () => {
  const bad = structuredClone(beach);
  bad.sentence = 'Nous allons à la piscine.';
  bad.links[0].head = 6;
  expectDrop(bad, 'join', 'Nous allons à la plage.', 'Nous allons à la piscine.');
  expect(parseRound({ items: [bad] }).dropped[0].reason).not.toContain('link');
});

test('a mixed round keeps good items in order and reports original bad indexes', () => {
  const badJoin = structuredClone(beach);
  badJoin.sentence = 'Nous allons à la piscine.';
  const badLink = structuredClone(coffee);
  badLink.links[0].head = 5;
  const result = parseRound({ items: [structuredClone(beach), badJoin, structuredClone(cinema), badLink] });
  expect(result.items).toEqual([beach, cinema]);
  expect(result.dropped).toEqual([
    { index: 1, reason: expect.stringContaining('Nous allons à la piscine.') },
    { index: 3, reason: expect.stringContaining('head index 5') },
  ]);
});

test('an unknown extra item key is stripped without dropping the item', () => {
  const good = structuredClone(beach);
  Reflect.set(good, 'extra', 'TEST');
  const result = parseRound({ items: [good] });
  expect(result).toEqual({ items: [beach], dropped: [] });
  expect(result.items[0]).not.toHaveProperty('extra');
});
