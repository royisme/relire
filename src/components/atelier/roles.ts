/**
 * How the 14 brick roles look: six hues, one silhouette per family (the hue is never the only cue; the
 * role label repeats it in words). Who acts is red and round, verbs are blue and square, nouns and
 * determiners are yellow with an arched top, the small connecting words are green with opposite leaf
 * corners, the words that describe or deny are purple with the other leaf, and the rest is white.
 * The colours themselves are the game surface's variables in `src/index.css`.
 */
import type { BrickRole } from '../../types/atelier';

export type Hue = 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'white';
export type Shape = 'actor' | 'verb' | 'thing' | 'link' | 'mod' | 'mark';

export const LOOK: Record<BrickRole, { hue: Hue; shape: Shape }> = {
  subject: { hue: 'red', shape: 'actor' },
  pronoun: { hue: 'red', shape: 'actor' },
  verb: { hue: 'blue', shape: 'verb' },
  auxiliary: { hue: 'blue', shape: 'verb' },
  noun: { hue: 'yellow', shape: 'thing' },
  determiner: { hue: 'yellow', shape: 'thing' },
  preposition: { hue: 'green', shape: 'link' },
  contraction: { hue: 'green', shape: 'link' },
  conjunction: { hue: 'green', shape: 'link' },
  adjective: { hue: 'purple', shape: 'mod' },
  adverb: { hue: 'purple', shape: 'mod' },
  negation: { hue: 'purple', shape: 'mod' },
  expression: { hue: 'white', shape: 'mark' },
  punctuation: { hue: 'white', shape: 'mark' },
};
