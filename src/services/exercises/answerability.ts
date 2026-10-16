/**
 * Answerability check for exercises generated from an article: every item
 * quotes the article words its answer rests on, and a quote that does not occur
 * in the article means the item cannot be answered from it. Pure string
 * matching. Does not own the generation request or the schema.
 */

/** Case, spacing, apostrophes and quotation marks must not decide whether a quote matches. */
const canonical = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether every stretch of the quote occurs in the article. A quote may join
 * separate stretches with an ellipsis; each stretch is checked on its own.
 */
export function quoteInArticle(quote: string, article: string): boolean {
  const text = canonical(article);
  const stretches = quote
    .split(/…|\.{3}/)
    .map(canonical)
    .filter(Boolean);
  return stretches.length > 0 && stretches.every((stretch) => text.includes(stretch));
}

export interface UnsupportedQuote {
  unitId: string;
  itemId: string;
  quote: string;
}

/** Items whose quote is missing from the article. An item without a quote cannot be checked and is not listed. */
export function unsupportedQuotes(
  units: { id: string; items: { id: string; articleQuote?: string }[] }[],
  article: string,
): UnsupportedQuote[] {
  const found: UnsupportedQuote[] = [];
  for (const unit of units)
    for (const item of unit.items)
      if (item.articleQuote !== undefined && !quoteInArticle(item.articleQuote, article))
        found.push({ unitId: unit.id, itemId: item.id, quote: item.articleQuote });
  return found;
}

export interface AnswerableSet<U> {
  /** The units that remain, without the items whose quote is not in the article. */
  units: U[];
  /** How many items were left out. */
  dropped: number;
  /** What was left out, for an error that names it when nothing remains. */
  missing: UnsupportedQuote[];
}

/**
 * Leaves out only the items whose quote is not in the article (and a unit left
 * with no items), keeping the rest. A unit that lost items is numbered again
 * from 1 where its numbers were plain numbers, so the sheet shows no gap.
 */
export function keepAnswerable<
  I extends { id: string; articleQuote?: string; itemNumber: number | string },
  U extends { id: string; items: I[] },
>(units: U[], article: string): AnswerableSet<U> {
  const missing = unsupportedQuotes(units, article);
  const gone = new Set(missing.map((m) => `${m.unitId}:${m.itemId}`));
  const kept: U[] = [];
  for (const unit of units) {
    const items = unit.items.filter((item) => !gone.has(`${unit.id}:${item.id}`));
    if (!items.length) continue;
    const renumber = items.length < unit.items.length && items.every((item) => typeof item.itemNumber === 'number');
    kept.push({ ...unit, items: renumber ? items.map((item, index) => ({ ...item, itemNumber: index + 1 })) : items });
  }
  return { units: kept, dropped: missing.length, missing };
}
