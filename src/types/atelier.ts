/**
 * The atelier (sentence-brick) item contract: what the AI returns for one item
 * and the provenance meta stored on the mapped SENTENCE_BUILD item. Owns the
 * shapes only; the join rule and the boundary check live in services/atelier.
 */
import { z } from 'zod';
import { GrammarTagSchema } from './grammar';
import { ThemeIdSchema } from './themes';

const text = z.string().trim().min(1);

/** Learner-facing text in both learner languages. */
const BilingualTextSchema = z.strictObject({ zh: text, en: text });

/** One word or fixed expression: single spaces inside, never a tab, newline or doubled space. */
const brickText = text.regex(
  /^(\S+( \S+)*)$/,
  'a brick is one word or a fixed expression with single spaces, no tab or newline',
);

export const BrickRoleSchema = z.enum([
  'subject',
  'verb',
  'auxiliary',
  'noun',
  'determiner',
  'preposition',
  'contraction',
  'adjective',
  'adverb',
  'negation',
  'conjunction',
  'pronoun',
  'expression',
  'punctuation',
]);
export type BrickRole = z.infer<typeof BrickRoleSchema>;

export const AtelierLevelSchema = z.enum(['A2', 'B1', 'B2']);
export type AtelierLevel = z.infer<typeof AtelierLevelSchema>;

export const BrickSchema = z.object({ text: brickText, role: BrickRoleSchema });
export type Brick = z.infer<typeof BrickSchema>;

/** A wrong-but-tempting brick; the reason is shown when it is placed. */
export const DistractorSchema = BrickSchema.extend({ reason: BilingualTextSchema });
export type Distractor = z.infer<typeof DistractorSchema>;

/** The kind of grammatical connection one link draws between bricks. */
export const RelationSchema = z.enum([
  'subject',
  'object',
  'complement',
  'article',
  'agreement',
  'negation',
  'modifier',
  'pronoun',
]);
export type Relation = z.infer<typeof RelationSchema>;

export const LinkSchema = z.object({
  /** Index into the item's `bricks`: the brick the connection hangs off (the verb, the noun of an article). */
  head: z.number().int().nonnegative(),
  /** Indexes into the same brick list; the boundary check keeps them off `head` and each other. */
  dependents: z.array(z.number().int().nonnegative()).min(1),
  relation: RelationSchema,
  /** The real grammar term shown on the connection (COD, à + nom, accord f. sg., sujet). */
  label: text,
  /** One short line stating the rule, in both learner languages. */
  note: BilingualTextSchema,
});
export type Link = z.infer<typeof LinkSchema>;

/** All the grammatical connections of one sentence; an item, and a modify, each have at least one. */
const LinksSchema = z.array(LinkSchema).min(1);

export const ModifyChangeSchema = z.enum(['negative', 'plural', 'subject', 'question']);
export type ModifyChange = z.infer<typeof ModifyChangeSchema>;

export const ModifySchema = z.object({
  change: ModifyChangeSchema,
  instruction: BilingualTextSchema,
  sentence: text,
  /** The complete brick list of the new sentence; the tray reuses the item's own distractors. */
  bricks: z.array(BrickSchema).min(2),
  /** The connections of the new sentence, over `bricks`. */
  links: LinksSchema,
});
export type Modify = z.infer<typeof ModifySchema>;

/** What the AI returns for one item; `parseRound` confirms it agrees with itself. */
export const AtelierItemSchema = z.object({
  meaning: BilingualTextSchema,
  sentence: text,
  /** Other correct sentences built from exactly the same bricks. */
  variants: z.array(text),
  /** In the order of `sentence`. */
  bricks: z.array(BrickSchema).min(2),
  distractors: z.array(DistractorSchema).min(1),
  links: LinksSchema,
  explanation: BilingualTextSchema,
  /** The single primary tag; ExerciseItem holds one. */
  grammarTag: GrammarTagSchema,
  modify: ModifySchema.optional(),
});
export type AtelierItem = z.infer<typeof AtelierItemSchema>;

/** Saved on the mapped SENTENCE_BUILD item, so a replayed unit keeps the bricks and their links. */
export const AtelierMetaSchema = z.strictObject({
  source: z.literal('atelier'),
  themeId: ThemeIdSchema,
  level: AtelierLevelSchema,
  bricks: z.array(BrickSchema),
  distractors: z.array(DistractorSchema),
  links: LinksSchema,
  explanation: BilingualTextSchema,
  modify: ModifySchema.optional(),
  strictAccents: z.literal(true),
});
export type AtelierMeta = z.infer<typeof AtelierMetaSchema>;
