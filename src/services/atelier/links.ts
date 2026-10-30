/**
 * How a sentence's links are drawn: the lane space each row of bricks needs above it, the path of every link
 * and where its label sits, and the timing of the lighting sequence. Pure: it works on boxes (the bricks'
 * faces, in one coordinate space) and knows nothing of React or the DOM. A link is a bus: a rail above the
 * row, one stub from the head and one to each dependent, so a head with several links grows a trunk with
 * branches, like a circuit. Does not own what a link means (the item does) or how a line looks (the CSS).
 */
import type { Link } from '../../types/atelier';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The height of one lane: a label chip and the air around it. */
export const LANE = 26;
const CHIP_H = 20;
/** A stud pokes this far above a brick's face; the shadow hangs this far below it. */
const STUD = 5;
const SHADOW = 4;
/** The radius of an elbow where a rail turns into a stub. */
const ELBOW = 7;

/** A label chip's width, estimated from its text (12px sans); the chip itself is laid out by the browser. */
const chipWidth = (label: string) => Math.round(label.length * 6.6 + 18);

export interface Wire {
  /** Index into the item's links. */
  index: number;
  /** The head stub and the rails, ending in the stubs of the outermost dependents: drawn first. */
  main: string;
  /** The stubs of the dependents that sit between the head and the end of a rail: drawn last. */
  drops: string;
  chip: { x: number; y: number };
  /** Where the line lands on a brick: the head wears a socket ring, a dependent a plug. */
  ends: { x: number; y: number; head: boolean }[];
}

export interface Routed {
  /** Lanes (levels) needed above each row of bricks; row 0 is the top one. */
  levels: number[];
  /** The row each brick sits in, by brick index. */
  rowOf: number[];
  wires: Wire[];
}

/** Rows by the faces' tops: bricks within half a face of the row's first brick share it. */
function rowsOf(boxes: Box[]): { rowOf: number[]; tops: number[]; bottoms: number[] } {
  const order = boxes.map((_, index) => index).sort((a, b) => boxes[a].y - boxes[b].y);
  const rowOf: number[] = [];
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (const index of order) {
    const box = boxes[index];
    if (tops.length === 0 || box.y - tops[tops.length - 1] > box.h / 2) {
      tops.push(box.y);
      bottoms.push(box.y + box.h);
    }
    rowOf[index] = tops.length - 1;
    bottoms[tops.length - 1] = Math.max(bottoms[tops.length - 1], box.y + box.h);
  }
  return { rowOf, tops, bottoms };
}

/**
 * Routes every link over the bricks' boxes (`boxes[i]` is brick i). A link sits in the lane space above the
 * lowest row it touches, so a link that crosses to the row above hangs from that row's bottoms; shorter
 * links take the lower lanes and two links share a lane only when their spans (labels included) are apart.
 */
export function routeLinks(boxes: Box[], links: Link[]): Routed {
  const { rowOf, tops, bottoms } = rowsOf(boxes);
  const centre = (index: number) => boxes[index].x + boxes[index].w / 2;

  const placed = links.map((link, index) => {
    const members = [link.head, ...link.dependents];
    const xs = members.map(centre).sort((a, b) => a - b);
    const lane = Math.max(...members.map((member) => rowOf[member]));
    // The label goes in the widest stretch between two stubs, so it covers none of them.
    let at = (xs[0] + xs[xs.length - 1]) / 2;
    let widest = -1;
    for (let i = 1; i < xs.length; i++)
      if (xs[i] - xs[i - 1] > widest) {
        widest = xs[i] - xs[i - 1];
        at = (xs[i] + xs[i - 1]) / 2;
      }
    const half = chipWidth(link.label) / 2;
    return {
      index,
      link,
      members,
      lane,
      at,
      lo: Math.min(xs[0], at - half),
      hi: Math.max(xs[xs.length - 1], at + half),
    };
  });

  const levels = tops.map(() => 0);
  const levelOf: number[] = [];
  const byWidth = [...placed].sort((a, b) => a.hi - a.lo - (b.hi - b.lo) || a.index - b.index);
  const taken: { lane: number; level: number; lo: number; hi: number }[] = [];
  for (const entry of byWidth) {
    let level = 1;
    while (
      taken.some(
        (other) =>
          other.lane === entry.lane && other.level === level && other.lo - 8 < entry.hi && entry.lo - 8 < other.hi,
      )
    )
      level++;
    taken.push({ lane: entry.lane, level, lo: entry.lo, hi: entry.hi });
    levelOf[entry.index] = level;
    levels[entry.lane] = Math.max(levels[entry.lane], level);
  }

  const wires = placed.map(({ index, link, lane, at }): Wire => {
    const railY = tops[lane] - STUD - 5 - CHIP_H / 2 - (levelOf[index] - 1) * LANE;
    // A brick in the lane's own row is reached from above; a brick in a row above, from below.
    const land = (member: number) => ({
      x: centre(member),
      y: rowOf[member] === lane ? tops[lane] - STUD : bottoms[rowOf[member]] + SHADOW,
    });
    const head = land(link.head);
    const deps = link.dependents.map(land);
    const left = deps.filter((dep) => dep.x < head.x - 0.5).sort((a, b) => a.x - b.x);
    const right = deps.filter((dep) => dep.x > head.x + 0.5).sort((a, b) => b.x - a.x);
    const straight = deps.filter((dep) => Math.abs(dep.x - head.x) <= 0.5);

    const main: string[] = [`M ${head.x} ${head.y} V ${railY}`];
    const drops: string[] = [];
    // One side: the rail runs from the head to the far end, which turns down (or up) into its brick.
    const side = (ends: typeof deps, toward: 1 | -1) => {
      if (ends.length === 0) return;
      const far = ends[0];
      const reach = Math.abs(far.x - head.x);
      const turn = far.y > railY ? 1 : -1;
      const r = Math.min(ELBOW, reach / 2);
      main.push(
        `M ${head.x} ${railY} H ${far.x - toward * r} Q ${far.x} ${railY} ${far.x} ${railY + turn * r} V ${far.y}`,
      );
      for (const dep of ends.slice(1)) drops.push(`M ${dep.x} ${railY} V ${dep.y}`);
    };
    side(left, -1);
    side(right, 1);
    // A dependent right under or over the head hangs from the same stub.
    for (const dep of straight) drops.push(`M ${dep.x} ${railY} V ${dep.y}`);

    return {
      index,
      main: main.join(' '),
      drops: drops.join(' '),
      chip: { x: at, y: railY },
      ends: [{ ...head, head: true }, ...deps.map((dep) => ({ ...dep, head: false }))],
    };
  });

  return { levels, rowOf, wires };
}

/** The lighting sequence, in milliseconds from the moment the row is right. One source for the lines, the cues and the sheet. */
export const LIGHT = {
  /** The rows make room for the wiring first. */
  base: 260,
  /** Between two links (never more than three a second). */
  step: 340,
  /** One line leaving its head and landing. */
  draw: 260,
  /** After the last landing, before the row settles. */
  beat: 180,
} as const;

export function lightingPlan(count: number): {
  leave: (i: number) => number;
  arrive: (i: number) => number;
  total: number;
} {
  const leave = (i: number) => LIGHT.base + i * LIGHT.step;
  const arrive = (i: number) => leave(i) + LIGHT.draw;
  return { leave, arrive, total: arrive(count - 1) + LIGHT.beat };
}
