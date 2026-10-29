/**
 * The sentence workshop's round state in Build mode: which bricks are placed,
 * what the tray holds, how often an item was checked, the item that returns
 * once at the end, and the counts for the summary. Pure: no React, DOM, audio,
 * AI or storage. The screen drives it with `roundReducer`; a check that the app
 * cannot settle alone goes out through `prepareCheck`'s `ask` and comes back
 * as a `checked` action. Does not own grading rules (`gradeItem`), the join
 * rule (`joinBricks`) or the sounds and motion that follow an `event`.
 */
import type { AtelierItem, Brick } from '../../types/atelier';
import { emptyAnswer } from '../exercises/answer';
import { gradeItem } from '../exercises/grading';
import { joinBricks } from './join';
import type { RoundChoice } from './source';
import { toExerciseItem } from './toExerciseItem';

/** One brick on the tray or the row. Ids are unique within a turn. */
export interface Piece {
  id: string;
  brick: Brick;
  /** Why this brick is wrong; present only on a distractor. */
  reason?: { zh: string; en: string };
  /** Index into the item's bricks; null for a distractor. */
  origin: number | null;
  /** The real grammar terms of the sockets, on the frame's verb brick only. */
  sockets?: string[];
}

/** The line shown in the status slot; the screen turns it into words. */
export type Note =
  | { kind: 'distractor'; pieceId: string }
  | { kind: 'fused'; parts: [string, string]; into: string }
  /** `feedback` is the grader's text; null means the flagged distractors are the reason. */
  | { kind: 'wrong'; feedback: string | null }
  /** A grading call that failed: not a check, nothing is counted. */
  | { kind: 'error'; message: string };

/** One appearance of one item: its first time, or its single return at the end of the round. */
export interface Turn {
  itemIndex: number;
  retry: boolean;
  /** The tray, in its stable shuffle; a placed piece keeps its slot. */
  pieces: Piece[];
  /** Piece ids, in row order. */
  placed: string[];
  /** Checks that reached a verdict. */
  checks: number;
  pending: boolean;
  right: boolean;
  note: Note | null;
  /** Every joined row that reached a verdict, oldest first. */
  answers: string[];
}

/** What just happened, for the sounds and motion; `n` makes two equal events distinct. */
export interface RoundEvent {
  n: number;
  kind: 'snap' | 'fuse' | 'remove' | 'wrong' | 'right' | 'finish';
  pieceId?: string;
}

/** What the round records about an item that was finished right. */
export interface ItemResult {
  itemIndex: number;
  /** The row that was graded right (the return's row when the item came back). */
  finalAnswer: string;
  rightFirstTime: boolean;
}

export interface RoundState {
  items: AtelierItem[];
  turns: Turn[];
  /** Index into `turns`; equal to `turns.length` once the last turn is left. */
  current: number;
  results: ItemResult[];
  ended: boolean;
  event: RoundEvent | null;
}

export type RoundAction =
  | { type: 'place'; pieceId: string }
  | { type: 'remove'; pieceId: string }
  | { type: 'removeLast' }
  | { type: 'pending' }
  | { type: 'checked'; answer: string; correct: boolean; feedback: string | null }
  | { type: 'failed'; message: string }
  | { type: 'next' }
  | { type: 'end' };

/** A preposition and its article melt into one brick; the fused word is looked up in the tray. */
const FUSIONS: Record<string, string> = { 'à le': 'au', 'à les': 'aux', 'de le': 'du', 'de les': 'des' };

/** A seeded generator, so a tray keeps its order every time the item is shown. */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: readonly T[], seed: string): T[] {
  const random = seededRandom(seed);
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeTurn(item: AtelierItem, itemIndex: number, retry: boolean): Turn {
  const pieces: Piece[] = [
    ...item.bricks.map((brick, index) => ({
      id: `b${index}`,
      brick,
      origin: index,
      ...(index === item.frame.verb ? { sockets: item.frame.sockets.map((socket) => socket.label) } : {}),
    })),
    ...item.distractors.map(({ reason, ...brick }, index) => ({ id: `d${index}`, brick, reason, origin: null })),
  ];
  // A tray that happens to read as the sentence would give the answer away, so try another seed.
  const inOrder = (order: Piece[]) => order.slice(0, item.bricks.length).every((piece, i) => piece.origin === i);
  let tray = shuffled(pieces, `${item.sentence}${retry ? ':again' : ''}`);
  for (let salt = 1; inOrder(tray) && salt < 20; salt++) tray = shuffled(pieces, `${item.sentence}:${salt}`);
  return {
    itemIndex,
    retry,
    pieces: tray,
    placed: [],
    checks: 0,
    pending: false,
    right: false,
    note: null,
    answers: [],
  };
}

export function startRound(items: AtelierItem[]): RoundState {
  return {
    items,
    turns: items.map((item, index) => makeTurn(item, index, false)),
    current: 0,
    results: [],
    ended: false,
    event: null,
  };
}

export const isOver = (state: RoundState): boolean => state.ended || state.current >= state.turns.length;

/** The turn on screen; only valid while the round is not over. */
export const currentTurn = (state: RoundState): Turn => state.turns[state.current];

export const pieceOf = (turn: Turn, pieceId: string): Piece => turn.pieces.find((piece) => piece.id === pieceId)!;

/** The row's bricks, in order. */
export const placedBricks = (turn: Turn): Piece[] => turn.placed.map((id) => pieceOf(turn, id));

/** What a check of the row would be graded on. */
export const rowText = (turn: Turn): string => joinBricks(placedBricks(turn).map((piece) => piece.brick));

/** True while the row can still be edited and checked. */
export const isBuilding = (turn: Turn): boolean => !turn.right && !turn.pending;

/** Real counts only: items finished, and those right on their first check. */
export function summaryOf(state: RoundState): { total: number; rightFirstTime: number } {
  return {
    total: state.results.length,
    rightFirstTime: state.results.filter((result) => result.rightFirstTime).length,
  };
}

export type Check =
  /** The app settles it alone: an exact sentence, a variant, or a row holding a flagged distractor. */
  | { kind: 'verdict'; answer: string; correct: boolean }
  /** Anything else is for the grader. */
  | { kind: 'ask'; answer: string };

/**
 * How a check of the current row goes. A row with a distractor is wrong without a call: its reason is
 * already on screen. Otherwise `gradeItem` decides; accents count, because bricks are exact tokens and an
 * `a` for an `à` must never pass.
 */
export function prepareCheck(state: RoundState, choice: RoundChoice): Check {
  const turn = currentTurn(state);
  const answer = rowText(turn);
  if (placedBricks(turn).some((piece) => piece.reason)) return { kind: 'verdict', answer, correct: false };
  const exercise = toExerciseItem(state.items[turn.itemIndex], {
    id: 'atelier-check',
    itemNumber: turn.itemIndex + 1,
    ...choice,
    language: 'en',
  });
  const graded = gradeItem(
    'SENTENCE_BUILD',
    exercise,
    { ...emptyAnswer(exercise), singleAnswer: answer },
    { strictAccents: true },
  );
  return graded.status === 'graded' ? { kind: 'verdict', answer, correct: graded.correct } : { kind: 'ask', answer };
}

const nextEvent = (state: RoundState, kind: RoundEvent['kind'], pieceId?: string): RoundEvent => ({
  n: (state.event?.n ?? 0) + 1,
  kind,
  ...(pieceId ? { pieceId } : {}),
});

function withTurn(state: RoundState, turn: Turn, event: RoundEvent | null): RoundState {
  return { ...state, turns: state.turns.map((candidate, i) => (i === state.current ? turn : candidate)), event };
}

function place(state: RoundState, turn: Turn, pieceId: string): RoundState {
  const piece = turn.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || turn.placed.includes(pieceId)) return state;
  const placed = [...turn.placed, pieceId];
  const [first, second] = placed.slice(-2).map((id) => pieceOf(turn, id));
  const fusedText = placed.length >= 2 ? FUSIONS[`${first.brick.text} ${second.brick.text}`.toLowerCase()] : undefined;
  // Only a sentence brick of role contraction melts: du and des are also plain articles, which must not appear from nowhere.
  const fused = fusedText
    ? turn.pieces.find(
        (candidate) =>
          candidate.origin !== null &&
          candidate.brick.role === 'contraction' &&
          candidate.brick.text.toLowerCase() === fusedText &&
          !placed.includes(candidate.id),
      )
    : undefined;
  if (fused)
    return withTurn(
      state,
      {
        ...turn,
        placed: [...placed.slice(0, -2), fused.id],
        note: { kind: 'fused', parts: [first.brick.text, second.brick.text], into: fused.brick.text },
      },
      nextEvent(state, 'fuse', fused.id),
    );
  return withTurn(
    state,
    { ...turn, placed, note: piece.reason ? { kind: 'distractor', pieceId } : null },
    nextEvent(state, 'snap', pieceId),
  );
}

function checked(state: RoundState, turn: Turn, answer: string, correct: boolean, feedback: string | null) {
  const next: Turn = { ...turn, pending: false, checks: turn.checks + 1, answers: [...turn.answers, answer] };
  if (!correct) return withTurn(state, { ...next, note: { kind: 'wrong', feedback } }, nextEvent(state, 'wrong'));
  const done = withTurn(state, { ...next, right: true, note: null }, nextEvent(state, 'right'));
  const known = done.results.some((result) => result.itemIndex === turn.itemIndex);
  if (known)
    return {
      ...done,
      results: done.results.map((result) =>
        result.itemIndex === turn.itemIndex ? { ...result, finalAnswer: answer } : result,
      ),
    };
  const rightFirstTime = next.checks === 1;
  return {
    ...done,
    results: [...done.results, { itemIndex: turn.itemIndex, finalAnswer: answer, rightFirstTime }],
    // A missed item returns once, after the last item of the round.
    turns: rightFirstTime ? done.turns : [...done.turns, makeTurn(state.items[turn.itemIndex], turn.itemIndex, true)],
  };
}

export function roundReducer(state: RoundState, action: RoundAction): RoundState {
  if (action.type === 'end') return { ...state, ended: true };
  if (isOver(state)) return state;
  const turn = currentTurn(state);
  switch (action.type) {
    case 'place':
      return isBuilding(turn) ? place(state, turn, action.pieceId) : state;
    case 'remove': {
      if (!isBuilding(turn) || !turn.placed.includes(action.pieceId)) return state;
      const placed = turn.placed.filter((id) => id !== action.pieceId);
      return withTurn(state, { ...turn, placed, note: null }, nextEvent(state, 'remove', action.pieceId));
    }
    case 'removeLast':
      return turn.placed.length
        ? roundReducer(state, { type: 'remove', pieceId: turn.placed[turn.placed.length - 1] })
        : state;
    case 'pending':
      return isBuilding(turn) && turn.placed.length ? withTurn(state, { ...turn, pending: true }, state.event) : state;
    case 'checked':
      return turn.right || !turn.placed.length
        ? state
        : checked(state, turn, action.answer, action.correct, action.feedback);
    case 'failed':
      return turn.pending
        ? withTurn(state, { ...turn, pending: false, note: { kind: 'error', message: action.message } }, state.event)
        : state;
    case 'next': {
      if (!turn.right) return state;
      const current = state.current + 1;
      return { ...state, current, event: current >= state.turns.length ? nextEvent(state, 'finish') : null };
    }
  }
}
