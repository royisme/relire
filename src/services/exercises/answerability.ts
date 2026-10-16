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
