/** Real reducer and deterministic grader; the only stand-in is the asynchronous grade service. */
import { expect, mock, test } from 'bun:test';
import {
  currentTurn,
  isOver,
  pieceOf,
  placedBricks,
  prepareCheck,
  roundReducer,
  rowText,
  startRound,
  summaryOf,
  turnOutcome,
  type RoundState,
} from '../src/services/atelier/roundState';
import { parseRound } from '../src/services/atelier/parse';
import type { AtelierItem } from '../src/types/atelier';
import { atelierChoice, beach, cinema, devRound } from './fixtures/atelier';

const place = (state: RoundState, ...ids: string[]) =>
  ids.reduce((next, pieceId) => roundReducer(next, { type: 'place', pieceId }), state);
const build = (state: RoundState) =>
  place(state, ...state.items[currentTurn(state).itemIndex].bricks.map((_, index) => `b${index}`));
const clear = (state: RoundState) =>
  currentTurn(state).placed.reduce((next, pieceId) => roundReducer(next, { type: 'remove', pieceId }), state);
const grade = mock(async (_item: AtelierItem, _answer: string) => ({ isCorrect: false, feedback: 'TEST verdict' }));

async function check(state: RoundState) {
  // The same boundary RoundView uses: prepareCheck calls the real gradeItem, never a mocked verdict.
  const result = prepareCheck(state, atelierChoice);
  if (result.kind === 'verdict')
    return roundReducer(state, { type: 'checked', answer: result.answer, correct: result.correct, feedback: null });
  const pending = roundReducer(state, { type: 'pending' });
  const verdict = await grade(state.items[currentTurn(state).itemIndex], result.answer);
  return roundReducer(pending, {
    type: 'checked',
    answer: result.answer,
    correct: verdict.isCorrect,
    feedback: verdict.feedback,
  });
}

// Both fusion parts are correct sentence bricks: placing them cannot independently mark assistance.
// This catches a fusion losing its assisted flag, which the dev item's two distractors would mask.
const fusionItem = parseRound({
  items: [
    {
      ...cinema,
      sentence: 'Je vais au cinéma avec le professeur à pied.',
      bricks: [
        ...cinema.bricks.slice(0, -1),
        { text: 'avec', role: 'preposition' },
        { text: 'le', role: 'determiner' },
        { text: 'professeur', role: 'noun' },
        { text: 'à', role: 'preposition' },
        { text: 'pied', role: 'noun' },
        { text: '.', role: 'punctuation' },
      ],
    },
  ],
}).items[0];

test('first unassisted right check alone earns first and the real summary count', async () => {
  const initial = startRound(devRound.items);
  const state = await check(build(initial));
  expect(currentTurn(initial).placed).toEqual([]);
  expect(currentTurn(state)).toMatchObject({ checks: 1, assisted: false, right: true });
  expect(turnOutcome(currentTurn(state))).toBe('first');
  expect(state.results).toEqual([{ itemIndex: 0, finalAnswer: 'Nous allons à la plage.', rightFirstTime: true }]);
  expect(summaryOf(state)).toEqual({ total: 1, rightFirstTime: 1 });
  expect(state.turns).toHaveLength(4);
});

test('a removed distractor still disqualifies a right first check', async () => {
  const placed = place(startRound([beach]), 'd0');
  expect(currentTurn(placed).assisted).toBe(true);
  const removed = roundReducer(placed, { type: 'removeLast' });
  expect(currentTurn(removed).placed).toEqual([]);
  const state = await check(build(removed));
  expect(currentTurn(state).checks).toBe(1);
  expect(turnOutcome(currentTurn(state))).toBe('missed');
  expect(state.results[0].rightFirstTime).toBe(false);
  expect(summaryOf(state)).toEqual({ total: 1, rightFirstTime: 0 });
});

test('a system fusion of unassisted sentence parts uses the own contraction and marks assistance', async () => {
  expect(fusionItem).toBeDefined();
  const first = place(startRound([fusionItem]), 'b7');
  expect(currentTurn(first).assisted).toBe(false);
  const state = place(first, 'b5');
  const turn = currentTurn(state);
  expect(turn.placed).toEqual(['b2']);
  expect(pieceOf(turn, 'b2')).toMatchObject({ origin: 2, brick: { text: 'au', role: 'contraction' } });
  expect(turn.pieces.filter((piece) => !turn.placed.includes(piece.id)).map((piece) => piece.id)).toEqual(
    expect.arrayContaining(['b7', 'b5']),
  );
  expect(turn.assisted).toBe(true);
  expect(turn.note).toEqual({ kind: 'fused', parts: ['à', 'le'], into: 'au' });
  expect(state.event).toEqual({ n: 2, kind: 'fuse', pieceId: 'b2' });
  const done = await check(build(clear(state)));
  expect(turnOutcome(currentTurn(done))).toBe('missed');
  expect(done.results[0].rightFirstTime).toBe(false);
});

test('no fusion without a sentence contraction, even with a distractor au or an article du', () => {
  for (const brick of [
    { text: 'au', role: 'determiner' },
    { text: 'du', role: 'contraction' },
  ] as const) {
    const item = structuredClone(fusionItem);
    item.bricks[2] = brick;
    // No candidate for à + le remains; the distractor au is never substituted.
    item.distractors = beach.distractors;
    const state = place(startRound([item]), 'b7', 'b5');
    expect(currentTurn(state).placed).toEqual(['b7', 'b5']);
    expect(currentTurn(state).assisted).toBe(false);
    expect(state.event?.kind).toBe('snap');
  }
});

test('reveal fills the row but never invents a learner finalAnswer', () => {
  const state = roundReducer(place(startRound(devRound.items), 'b3'), { type: 'reveal' });
  const turn = currentTurn(state);
  expect(turn.placed).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5']);
  expect(rowText(turn)).toBe('Nous allons à la plage.');
  expect(turn).toMatchObject({ right: true, revealed: true, assisted: true, checks: 0, answers: [] });
  expect(turnOutcome(turn)).toBe('missed');
  expect(state.results).toEqual([{ itemIndex: 0, finalAnswer: null, rightFirstTime: false }]);
  expect(summaryOf(state)).toEqual({ total: 1, rightFirstTime: 0 });
  expect(state.turns.map(({ itemIndex, retry }) => [itemIndex, retry])).toEqual([
    [0, false],
    [1, false],
    [2, false],
    [3, false],
    [0, true],
  ]);
});

for (const reason of ['wrong check', 'distractor', 'fusion', 'reveal'] as const) {
  test(`${reason}: a missed item returns at the end once, never twice, and the retry never earns first`, async () => {
    const items = [reason === 'fusion' ? fusionItem : devRound.items[0], ...devRound.items.slice(1)];
    let state = startRound(items);
    if (reason === 'wrong check') state = await check(place(state, 'b0'));
    if (reason === 'distractor') state = clear(place(state, 'd0'));
    if (reason === 'fusion') state = clear(place(state, 'b7', 'b5'));
    state = reason === 'reveal' ? roundReducer(state, { type: 'reveal' }) : await check(build(state));
    expect(turnOutcome(currentTurn(state))).toBe('missed');
    expect(state.results[0].rightFirstTime).toBe(false);
    expect(state.turns.map((turn) => [turn.itemIndex, turn.retry])).toEqual([
      [0, false],
      [1, false],
      [2, false],
      [3, false],
      [0, true],
    ]);
    for (const index of [1, 2, 3]) {
      state = roundReducer(state, { type: 'next' });
      expect(currentTurn(state).itemIndex).toBe(index);
      state = await check(build(state));
      expect(turnOutcome(currentTurn(state))).toBe('first');
    }
    state = roundReducer(state, { type: 'next' });
    expect(currentTurn(state)).toMatchObject({ itemIndex: 0, retry: true, placed: [] });
    // A second wrong check / reveal must not queue a third appearance either.
    state = await check(place(state, 'b0'));
    state = reason === 'reveal' ? roundReducer(state, { type: 'reveal' }) : await check(build(clear(state)));
    expect(turnOutcome(currentTurn(state))).toBe('retried');
    expect(state.turns).toHaveLength(5);
    expect(state.results.map((result) => result.rightFirstTime)).toEqual([false, true, true, true]);
    expect(summaryOf(state)).toEqual({ total: 4, rightFirstTime: 3 });
    expect(state.turns.map(turnOutcome)).toEqual(['missed', 'first', 'first', 'first', 'retried']);
    state = roundReducer(state, { type: 'next' });
    expect(isOver(state)).toBe(true);
    expect(state.event?.kind).toBe('finish');
  });
}

for (const [label, ids, expected, calls] of [
  ['missing brick', ['b0'], false, 0],
  ['distractor replacing a brick', ['b0', 'b1', 'd0', 'b3', 'b4', 'b5'], false, 0],
  ['extra distractor', ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'd0'], false, 0],
  ['exact sentence', ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'], true, 0],
  ['stored variant', ['b2', 'b3', 'b4', 'b0', 'b1', 'b5'], true, 0],
  ['other order of all the right bricks', ['b1', 'b0', 'b2', 'b3', 'b4', 'b5'], false, 1],
] as const) {
  test(`local verdict: ${label} makes ${calls} grade calls`, async () => {
    grade.mockClear();
    const state = await check(place(startRound([beach]), ...ids));
    expect(grade).toHaveBeenCalledTimes(calls);
    expect(currentTurn(state)).toMatchObject({ right: expected, checks: 1, pending: false });
    expect(currentTurn(state).answers).toEqual([rowText(currentTurn(state))]);
    if (calls) expect(grade).toHaveBeenCalledWith(beach, 'allons Nous à la plage.');
  });
}

test('reject and reveal each emit exactly one event per action, not on ignored actions', () => {
  const rejected = place(startRound([beach]), 'd0');
  expect(rejected.event).toEqual({ n: 1, kind: 'reject', pieceId: 'd0' });
  expect(place(rejected, 'd0')).toBe(rejected);
  const rejectedAgain = place(roundReducer(rejected, { type: 'removeLast' }), 'd0');
  expect(rejectedAgain.event).toEqual({ n: 3, kind: 'reject', pieceId: 'd0' });
  const shown = roundReducer(rejectedAgain, { type: 'reveal' });
  expect(shown.event).toEqual({ n: 4, kind: 'reveal' });
  expect(roundReducer(shown, { type: 'reveal' })).toBe(shown);
  expect(roundReducer(shown, { type: 'removeLast' })).toBe(shown);
  expect(placedBricks(shown.turns[0]).every((piece) => piece.origin !== null)).toBe(true);
});

test('a failed grade is not a check, unlocks the row and keeps the real failure', () => {
  const built = place(startRound([beach]), 'b1', 'b0', 'b2', 'b3', 'b4', 'b5');
  const pending = roundReducer(built, { type: 'pending' });
  expect(currentTurn(pending).pending).toBe(true);
  expect(place(pending, 'd0')).toBe(pending);
  const failed = roundReducer(pending, { type: 'failed', message: 'TEST quota exceeded' });
  expect(currentTurn(failed)).toMatchObject({
    checks: 0,
    answers: [],
    pending: false,
    note: { kind: 'error', message: 'TEST quota exceeded' },
  });
  expect(summaryOf(failed)).toEqual({ total: 0, rightFirstTime: 0 });
});
