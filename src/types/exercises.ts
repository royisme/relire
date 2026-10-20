/**
 * Exercise contracts: the 11 exercise types, items and units as Zod schemas
 * with per-type shape refinements, plus the plain types stored per learner
 * (item state, attempt). Owns what a playable unit looks like and when its
 * answers are well formed. Does not own grading (services/exercises/grading),
 * import drafts (services/exercises/importDraft) or storage.
 */
import { z } from 'zod';
import { GrammarTagSchema, type GrammarTag } from './grammar';
import {
  CheckpointQuestionSchema,
  TopicOriginSchema,
  TopicQuestionSchema,
  topicUnitId,
  type TopicResult,
} from './grammarCheckpoint';

export const ExerciseTypeSchema = z.enum([
  'WORD_TRANSFORM',
  'FILL_BLANKS',
  'GENDER_CHECK',
  'ODD_ONE_OUT',
  'MATCH_PAIRS',
  'DIALOGUE_ORDER',
  'CHOICE_SELECT',
  'SENTENCE_BUILD',
  'READING_CLOZE',
  'NUMBER_DICTATION',
  'OPEN_QA',
]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

/** Where the reference answer came from: the printed key, a model, or the learner. */
export const AnswerSourceSchema = z.enum(['material', 'ai', 'user']);
export type AnswerSource = z.infer<typeof AnswerSourceSchema>;

const text = z.string().trim().min(1);

export const ExerciseItemSchema = z.object({
  id: text,
  /** Overrides the unit's type for this item (mixed worksheets). */
  type: ExerciseTypeSchema.optional(),
  itemNumber: z.union([z.number(), text]),
  prompt: text,
  answerSource: AnswerSourceSchema.optional(),
  secondaryPrompt: z.string().optional(),
  options: z.array(text).optional(),
  expectedAnswer: z.union([text, z.array(text).min(1)]),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  grammarTag: GrammarTagSchema,
  audioText: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  topicQuestion: TopicQuestionSchema.optional(),
});
export type ExerciseItem = z.infer<typeof ExerciseItemSchema>;

type ItemShape = z.infer<typeof ExerciseItemSchema>;

/** Validate the exact shapes consumed by each exercise's controls and grader. */
export function refineExerciseItem(
  type: ExerciseType,
  item: ItemShape,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [...path, field], message });
  const answer = item.expectedAnswer;
  const options = item.options || [];
  if (
    ['DIALOGUE_ORDER', 'MATCH_PAIRS', 'ODD_ONE_OUT', 'GENDER_CHECK'].includes(type) &&
    new Set(options).size !== options.length
  )
    issue('options', 'Duplicate options');
  if (['DIALOGUE_ORDER', 'MATCH_PAIRS', 'ODD_ONE_OUT'].includes(type) && options.length < 2)
    issue('options', 'This exercise requires at least two nonblank options');
  if (type === 'DIALOGUE_ORDER') {
    const keys = options.map((option) => option[0].toLowerCase());
    if (new Set(keys).size !== keys.length) issue('options', 'Dialogue option prefixes must be unique');
    if (
      !Array.isArray(answer) ||
      answer.length !== keys.length ||
      new Set(answer.map((value) => value.toLowerCase())).size !== keys.length ||
      answer.some((value) => !keys.includes(value.toLowerCase()))
    )
      issue('expectedAnswer', 'Dialogue answer must order every option prefix exactly once');
    return;
  }
  if (type === 'MATCH_PAIRS') {
    const keys = options.map((option) => option[0].toLowerCase());
    if (new Set(keys).size !== keys.length) issue('options', 'Match option prefixes must be unique');
    if (typeof answer !== 'string' || !keys.includes(answer.toLowerCase()))
      issue('expectedAnswer', 'Match answer must be an available option prefix');
    return;
  }
  if (type === 'ODD_ONE_OUT' || type === 'GENDER_CHECK') {
    const allowed = type === 'GENDER_CHECK' && !item.options ? ['M', 'F'] : options;
    if (typeof answer !== 'string' || !allowed.includes(answer))
      issue('expectedAnswer', 'Answer must be an available option');
    return;
  }
  if (type === 'CHOICE_SELECT') {
    const groups = [...item.prompt.matchAll(/\{([^}]+)\}/g)].map((match) =>
      match[1].split('|').map((option) => option.trim()),
    );
    const answers = Array.isArray(answer) ? answer : [answer];
    if (!groups.length || groups.some((group) => group.length < 2 || group.some((option) => !option)))
      issue('prompt', 'Choice exercises require nonblank inline option groups');
    if (answers.length !== groups.length || answers.some((value, index) => !groups[index]?.includes(value)))
      issue('expectedAnswer', 'Choice answers must match the inline groups');
    return;
  }
  const blanks = (item.prompt.match(/\[___\]/g) || []).length;
  if ((type === 'FILL_BLANKS' || type === 'READING_CLOZE') && blanks > 1) {
    if (!Array.isArray(answer) || answer.length !== blanks)
      issue('expectedAnswer', 'Each blank requires one reference answer');
  } else if (typeof answer !== 'string') issue('expectedAnswer', 'This exercise requires a scalar reference answer');
}

export const ImportSourceKindSchema = z.enum(['image', 'pdf', 'text']);
export const ImportModeSchema = z.enum(['complete', 'extract', 'generate']);
export type ImportMode = z.infer<typeof ImportModeSchema>;

/** The levels an exercise batch can be made for. */
export const ExerciseLevelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1']);
export type ExerciseLevel = z.infer<typeof ExerciseLevelSchema>;
export const EXERCISE_LEVELS = ExerciseLevelSchema.options;

/**
 * A unit without its batch: what a model returns and what an import draft
 * reviews. `ExerciseUnitSchema` adds the batch it was saved with.
 */
export const ExtractedUnitSchema = z
  .object({
    id: text,
    section: z.enum(['GRAMMAIRE', 'VOCABULAIRE', 'CONJUGAISON', 'COMPRENDRE', 'EXTRA']),
    unitNumber: z.number().int().positive(),
    subPart: z.string().optional(),
    title: text,
    instruction: text,
    topicOrigin: TopicOriginSchema.optional(),
    example: z.string().optional(),
    readingPassage: z
      .object({
        title: z.string().optional(),
        content: text,
        translation: z.string().optional(),
      })
      .optional(),
    type: ExerciseTypeSchema,
    items: z.array(ExerciseItemSchema).min(1),
    grammarTags: z.array(GrammarTagSchema).min(1),
    importSource: z
      .object({
        kind: ImportSourceKindSchema,
        name: text,
        pages: z.array(z.number().int().positive()),
        mode: ImportModeSchema,
      })
      .optional(),
    isExtracurricular: z.boolean().optional(),
  })
  .superRefine((unit, ctx) => {
    if (unit.id.startsWith('topic:') !== Boolean(unit.topicOrigin))
      ctx.addIssue({ code: 'custom', message: 'Topic unit identity and origin must be paired' });
    unit.items.forEach((item, index) => refineExerciseItem(item.type ?? unit.type, item, ctx, ['items', index]));
    if (new Set(unit.items.map((item) => item.id)).size !== unit.items.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate item IDs' });
    unit.items.forEach((item, index) => {
      const fail = (message: string) => ctx.addIssue({ code: 'custom', path: ['items', index], message });
      if (Boolean(unit.topicOrigin) !== Boolean(item.topicQuestion)) fail('Topic origin and question must be paired');
      if (!unit.topicOrigin || !item.topicQuestion) return;
      const parsed = CheckpointQuestionSchema.safeParse({
        ...item,
        instruction: item.topicQuestion.instruction,
        feedback: item.topicQuestion.feedback,
      });
      if (!parsed.success)
        for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['items', index, ...issue.path] });
      if (item.meta?.strictAccents !== true) fail('Topic items require strict accents');
      if (
        item.explanation !== undefined ||
        item.audioText !== undefined ||
        item.options !== undefined ||
        item.answerSource !== undefined
      )
        fail('Topic questions cannot carry worksheet explanation, speech, options or answer source');
    });
    if (unit.topicOrigin) {
      const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
      if (unit.id !== topicUnitId(unit.topicOrigin)) fail('Topic unit identity does not match origin');
      if (unit.section !== 'GRAMMAIRE' || unit.unitNumber !== 1 || unit.type !== 'FILL_BLANKS')
        fail('Invalid topic unit defaults');
      if (unit.title !== unit.topicOrigin.title.en || unit.instruction !== unit.topicOrigin.instruction.en)
        fail('Topic required strings must match English metadata');
      if (unit.items.length !== 6) fail('Topic snapshot requires six questions');
      const checkpoints = new Set<string>();
      unit.items.forEach((item, index) => {
        const question = item.topicQuestion;
        if (!question) return;
        if (item.type !== (index % 2 === 0 ? 'CHOICE_SELECT' : 'FILL_BLANKS') || item.itemNumber !== index + 1)
          fail('Invalid topic question order');
        if (item.grammarTag !== unit.grammarTags[0]) fail('Topic item must use the first tag');
        if (index % 2 === 0) {
          if (checkpoints.has(question.checkpointId)) fail('Duplicate checkpoint ID');
          checkpoints.add(question.checkpointId);
        } else {
          const previous = unit.items[index - 1].topicQuestion;
          if (
            question.checkpointId !== previous?.checkpointId ||
            JSON.stringify(question.checkpointTitle) !== JSON.stringify(previous?.checkpointTitle)
          )
            fail('Each checkpoint must own two adjacent questions with the same title');
        }
      });
    }
  });
export type ExtractedUnit = z.infer<typeof ExtractedUnitSchema>;

/**
 * A playable unit, self-contained: `setId` is shared by every unit saved in one
 * import or generation batch, `setTitle` names the batch when it has a title,
 * `level` was chosen once for the batch and `createdAt` (epoch milliseconds) is
 * the moment the batch was made, the same on every unit of it. A unit never
 * points at an article.
 */
export const ExerciseUnitSchema = ExtractedUnitSchema.safeExtend({
  setId: text,
  setTitle: text.optional(),
  level: ExerciseLevelSchema,
  createdAt: z.number().int().positive(),
}).superRefine((unit, ctx) => {
  if (unit.topicOrigin && unit.setId !== unit.id)
    ctx.addIssue({ code: 'custom', path: ['setId'], message: 'A topic revision is its own set' });
});
export type ExerciseUnit = z.infer<typeof ExerciseUnitSchema>;

/** The type that governs an item: its own override, else the unit's. */
export const effectiveItemType = (item: Pick<ExerciseItem, 'type'>, unit: Pick<ExerciseUnit, 'type'>): ExerciseType =>
  item.type ?? unit.type;

/* ----------------------------- stored per learner ---------------------------- */

/**
 * What the learner has entered for one item. Every control writes the field it
 * owns; the rest stay at their empty value, so one shape serves all 11 types.
 */
export interface ExerciseAnswer {
  singleAnswer: string;
  multiAnswers: string[];
  choiceSelections: string[];
  selectedOdd: string | null;
  /** Dialogue lines in the order the learner arranged them. */
  dialogueOrder: string[];
  matchSelection: string;
}

/** The result of a check. `aiFeedback` is present when an AI grader decided it. */
export interface CheckedResult {
  correct: boolean;
  /** The accent preference the item was graded with, so per-slot markings stay as graded. */
  strictAccents: boolean;
  aiFeedback?: { feedback: string; correctedVersion?: string };
}

/** One row per item in `itemStates` (id is `unitId:itemId`). Reset deletes it; attempts stay. */
export interface ExerciseItemState {
  id: string;
  unitId: string;
  itemId: string;
  answer: ExerciseAnswer;
  /** Null until the learner checks the item. */
  checked: CheckedResult | null;
  hintShown: boolean;
  explanationShown: boolean;
  updatedAt: number;
}

/**
 * One row per check in `attempts`. It carries its own prompt and answer text so
 * history stays meaningful after the unit is deleted.
 */
export interface ExerciseAttempt {
  id: string;
  unitId: string;
  itemId: string;
  grammarTag: GrammarTag;
  prompt: string;
  userAnswer: string;
  expectedAnswer: string;
  correct: boolean;
  timestamp: number;
  /** Authored feedback retained even after the source snapshot is deleted. */
  topicResult?: TopicResult;
}

export const itemStateId = (unitId: string, itemId: string) => `${unitId}:${itemId}`;
