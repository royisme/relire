/**
 * The atelier boundary check: one AI round (already-parsed JSON) becomes the
 * items that agree with themselves. A bad item is dropped with one readable
 * reason and never blocks the others; only a response that is not a round at
 * all throws, because then there is nothing to show. This never judges whether
 * the French is correct — it only confirms an item matches its own bricks.
 */
import { AtelierItemSchema, type AtelierItem, type Brick, type Link } from '../../types/atelier';
import { joinBricks, normalizeSentence, tokensOf } from './join';

export interface ParsedRound {
  items: AtelierItem[];
  dropped: { index: number; reason: string }[];
}

/** Confirms every link agrees with its own brick list; the first reason, naming the link, or null. */
function checkLinks(bricks: Brick[], links: Link[]): string | null {
  for (const link of links) {
    if (!bricks[link.head]) return `the link “${link.label}” names head index ${link.head}, out of range`;
    for (const dependent of link.dependents) {
      if (!bricks[dependent]) return `the link “${link.label}” names dependent index ${dependent}, out of range`;
      if (dependent === link.head) return `the link “${link.label}” makes brick ${dependent} depend on itself`;
    }
    if (new Set(link.dependents).size !== link.dependents.length)
      return `the link “${link.label}” names the same dependent twice`;
  }
  return null;
}

/** Returns the parsed item, or the first reason (in check order) it fails. */
function checkItem(entry: unknown): AtelierItem | string {
  const parsed = AtelierItemSchema.safeParse(entry);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return `${first.path.length ? `${first.path.join('.')}: ` : ''}${first.message}`;
  }
  const item = parsed.data;

  const joined = joinBricks(item.bricks);
  const sentence = normalizeSentence(item.sentence);
  if (joined !== sentence) return `the bricks join to “${joined}” but the sentence reads “${sentence}”`;

  // A variant holding anything else (missing brick, borrowed distractor) would
  // grade a wrong build as right through the exact-match path, so the token
  // multisets must be identical.
  const expectedTokens = [...tokensOf(joined)].sort();
  for (const variant of item.variants) {
    const variantTokens = [...tokensOf(variant)].sort();
    if (variantTokens.length !== expectedTokens.length || variantTokens.some((token, i) => token !== expectedTokens[i]))
      return `the variant “${variant}” does not use exactly the sentence’s bricks`;
  }

  // Two identical tiles in the tray would be indistinguishable to the learner.
  const keyOf = (text: string): string => tokensOf(text).join(' ');
  for (const distractor of item.distractors) {
    if (item.bricks.some((brick) => keyOf(brick.text) === keyOf(distractor.text)))
      return `the distractor “${distractor.text}” spells a brick of the sentence`;
  }

  const linkReason = checkLinks(item.bricks, item.links);
  if (linkReason) return linkReason;

  if (item.modify) {
    const modifyJoined = joinBricks(item.modify.bricks);
    const modifySentence = normalizeSentence(item.modify.sentence);
    if (modifyJoined !== modifySentence)
      return `the modify bricks join to “${modifyJoined}” but the modify sentence reads “${modifySentence}”`;
    if (modifySentence === sentence) return `the modify sentence “${modifySentence}” changes nothing`;
    const modifyLinkReason = checkLinks(item.modify.bricks, item.modify.links);
    if (modifyLinkReason) return modifyLinkReason;
  }
  return item;
}

export function parseRound(raw: unknown): ParsedRound {
  const holder = typeof raw === 'object' && raw !== null ? (raw as { items?: unknown }) : null;
  if (!holder || !Array.isArray(holder.items)) {
    const what = !holder
      ? `${raw === null ? 'null' : `a value of type ${typeof raw}`} instead of an object`
      : holder.items === undefined
        ? 'an object without items'
        : `an object whose items is a ${typeof holder.items} instead of an array`;
    throw new Error(`The round was not usable: ${what}`);
  }
  const items: AtelierItem[] = [];
  const dropped: { index: number; reason: string }[] = [];
  holder.items.forEach((entry, index) => {
    const checked = checkItem(entry);
    if (typeof checked === 'string') dropped.push({ index, reason: checked });
    else items.push(checked);
  });
  return { items, dropped };
}
