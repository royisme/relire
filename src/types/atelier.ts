/**
 * The atelier (sentence-brick) item contract: what the AI returns for one item
 * and the provenance meta stored on the mapped SENTENCE_BUILD item. Owns the
 * shapes only; the join rule and the boundary check live in services/atelier.
 */
import { z } from 'zod';
import { GrammarTagSchema } from './grammar';
import { TaskIdSchema, ThemeIdSchema } from './themes';

const text = z.string().trim().min(1);
const slug = z.string().regex(/^[a-z]+(-[a-z]+)*$/);

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

export const FrameSchema = z.object({
  /** Index into the item's `bricks`; the boundary check pins the role. */
  verb: z.number().int().nonnegative(),
  sockets: z.array(
    z.object({
      /** The real grammar term shown on the socket (COD, à + nom, de + infinitif). */
      label: text,
      filledBy: z.array(z.number().int().nonnegative()),
    }),
  ),
});
export type Frame = z.infer<typeof FrameSchema>;

export const ModifyChangeSchema = z.enum(['negative', 'plural', 'subject', 'question']);
export type ModifyChange = z.infer<typeof ModifyChangeSchema>;

export const ModifySchema = z.object({
  change: ModifyChangeSchema,
  instruction: BilingualTextSchema,
  sentence: text,
  /** The complete brick list of the new sentence; the tray reuses the item's own distractors. */
  bricks: z.array(BrickSchema).min(2),
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
  frame: FrameSchema,
  explanation: BilingualTextSchema,
  /** The single primary tag; ExerciseItem holds one. */
  grammarTag: GrammarTagSchema,
  modify: ModifySchema.optional(),
});
export type AtelierItem = z.infer<typeof AtelierItemSchema>;

/** Saved on the mapped SENTENCE_BUILD item, so a replayed unit keeps the bricks and their frame. */
export const AtelierMetaSchema = z.strictObject({
  source: z.literal('atelier'),
  themeId: ThemeIdSchema,
  subtopicId: slug,
  taskId: TaskIdSchema,
  level: AtelierLevelSchema,
  bricks: z.array(BrickSchema),
  distractors: z.array(DistractorSchema),
  frame: FrameSchema,
  explanation: BilingualTextSchema,
  modify: ModifySchema.optional(),
});
export type AtelierMeta = z.infer<typeof AtelierMetaSchema>;
