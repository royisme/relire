/**
 * The noun-gender round's deck: which noun ids are still waiting, in order, and which cards were right on
 * their first answer. Pure and immutable, with no React, no storage and no sampling: `prepareGenderDrills`
 * owns the sample and the view owns the writes, so only the first answer to a card is ever recorded.
 */
export interface GenderDeck {
  /** Cards still to answer, in order; the first one is the card on screen. */
  readonly queue: readonly string[];
  /** Every card answered at least once, by id: whether its first answer was right. */
  readonly firstTry: Readonly<Record<string, boolean>>;
  readonly total: number;
}

export const createDeck = (ids: readonly string[]): GenderDeck => ({
  queue: [...ids],
  firstTry: {},
  total: ids.length,
});

/** The card to show: the head of the queue, or undefined once the round is done. */
export const currentCard = (deck: GenderDeck): string | undefined => deck.queue[0];

/** A card whose first answer is already recorded: answering it again writes nothing. */
export const wasAnswered = (deck: GenderDeck, id: string): boolean => id in deck.firstTry;

/**
 * The deck after answering `id`: a right answer takes the card out of the queue, a wrong one sends it to the
 * end (a returning card too, so it comes back later in the same round), and only a first answer is kept.
 */
export function answerCard(deck: GenderDeck, id: string, correct: boolean): GenderDeck {
  const queue = deck.queue.filter((queued) => queued !== id);
  return {
    queue: correct ? queue : [...queue, id],
    firstTry: wasAnswered(deck, id) ? deck.firstTry : { ...deck.firstTry, [id]: correct },
    total: deck.total,
  };
}

export interface GenderSummary {
  total: number;
  /** Cards answered at least once; an abandoned round has fewer than `total`. */
  answered: number;
  /** Cards out of the queue: answered right at least once. */
  right: number;
  firstTryRight: number;
}

export const summaryOf = (deck: GenderDeck): GenderSummary => ({
  total: deck.total,
  answered: Object.keys(deck.firstTry).length,
  right: deck.total - deck.queue.length,
  firstTryRight: Object.values(deck.firstTry).filter(Boolean).length,
});
