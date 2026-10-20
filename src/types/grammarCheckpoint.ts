/** Owns bilingual checkpoint questions and saved topic capabilities, without topic/exercise dependencies. */
import { z } from 'zod';
import { normalizeFrench } from '../services/exercises/normalizeFrench';
import { grammarTopicSlug } from './grammarTagIndex';

const text = z.string().trim().min(1);

/** The topic string scan also covers unkeyed French question and answer fields. */
export function scanTopicStrings(value: unknown, ctx: z.RefinementCtx, path: (string | number)[] = []) {
  if (typeof value === 'string') {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', path, message });
    if (value !== value.normalize('NFC')) fail('string is not NFC');
    const key = path.filter((part) => typeof part === 'string').at(-1);
    const french = ['fr', 'prompt', 'expectedAnswer', 'acceptableAnswers', 'answer'].includes(String(key));
    const han = /\p{Script=Han}/u.test(value);
    if ((french || key === 'en') && han) fail('CJK is not allowed in French or English');
    if (key === 'zh' && !han) fail('Chinese text needs a CJK character');
    if (french && value.includes("'")) fail('use the typographic apostrophe U+2019');
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanTopicStrings(item, ctx, [...path, i]));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) scanTopicStrings(item, ctx, [...path, key]);
  }
}

export const BilingualSchema = z.object({ en: text, zh: text }).superRefine(scanTopicStrings);
export type Bilingual = z.infer<typeof BilingualSchema>;
export const FeedbackMessageSchema = z.object({ summary: BilingualSchema, detail: BilingualSchema.optional() });
export type FeedbackMessage = z.infer<typeof FeedbackMessageSchema>;
export const TopicFeedbackSchema = z.object({
  correct: FeedbackMessageSchema,
  incorrect: FeedbackMessageSchema,
  byAnswer: z.array(z.object({ answer: text, message: FeedbackMessageSchema })).optional(),
});

const questionFields = {
  type: z.enum(['CHOICE_SELECT', 'FILL_BLANKS']),
  prompt: text,
  expectedAnswer: text,
  acceptableAnswers: z.array(text).optional(),
  feedback: TopicFeedbackSchema,
};

/** Shared by delivered questions and complete saved items, using the grading authority's strict key. */
export const TopicAnswerSchema = z.object(questionFields).superRefine((question, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const key = (answer: string) => normalizeFrench(answer, true);
  const answers = [question.expectedAnswer, ...(question.acceptableAnswers ?? [])].map(key);
  if (new Set(answers).size !== answers.length) fail('Duplicate normalized expected/acceptable answers');
  const matches = question.feedback.byAnswer ?? [];
  if (new Set(matches.map((entry) => key(entry.answer))).size !== matches.length)
    fail('Duplicate normalized feedback answers');
  if (matches.some((entry) => answers.includes(key(entry.answer)))) fail('Feedback match must be a wrong answer');
  if (question.type === 'CHOICE_SELECT') {
    const groups = [...question.prompt.matchAll(/\{([^{}]+)\}/g)];
    const rest = question.prompt.replace(/\{[^{}]+\}/g, '');
    const options = (groups[0]?.[1] ?? '').split('|').map((option) => option.trim());
    if (groups.length !== 1 || /[{}[\]]/.test(rest) || options.length < 2 || options.some((option) => !option))
      fail('Choice requires exactly one inline option group');
    if (new Set(options.map(key)).size !== options.length) fail('Duplicate normalized options');
    if (!options.includes(question.expectedAnswer)) fail('Expected answer must equal an option');
    if (question.acceptableAnswers !== undefined) fail('Choice cannot have acceptable answers');
    const wrong = options.filter((option) => option !== question.expectedAnswer);
    if (matches.length !== wrong.length || matches.some((entry) => !wrong.includes(entry.answer)))
      fail('Choice requires one feedback match per wrong option');
  } else {
    const blanks = question.prompt.match(/\[___\]/g) ?? [];
    if (blanks.length !== 1 || /[{}[\]]/.test(question.prompt.replace('[___]', '')))
      fail('Typed question requires exactly one blank');
  }
  scanTopicStrings(question, ctx);
});

export const TopicQuestionSchema = z
  .object({
    checkpointId: grammarTopicSlug,
    checkpointTitle: BilingualSchema,
    instruction: BilingualSchema,
    feedback: TopicFeedbackSchema,
  })
  .superRefine(scanTopicStrings);
export const CheckpointQuestionSchema = z
  .object({
    id: grammarTopicSlug,
    instruction: BilingualSchema,
    ...questionFields,
  })
  .superRefine((question, ctx) => {
    const result = TopicAnswerSchema.safeParse(question);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue });
  });
export const TopicOriginSchema = z.object({
  topicId: grammarTopicSlug,
  exerciseRevision: z.string().regex(/^[0-9a-f]{64}$/),
  title: BilingualSchema,
  instruction: BilingualSchema,
});
export const TopicResultSchema = z.object({
  ...TopicOriginSchema.pick({ topicId: true, exerciseRevision: true }).shape,
  instruction: BilingualSchema,
  feedback: FeedbackMessageSchema,
});
export type TopicResult = z.infer<typeof TopicResultSchema>;
export const topicUnitId = (origin: z.infer<typeof TopicOriginSchema>) =>
  `topic:${origin.topicId}:${origin.exerciseRevision}`;
