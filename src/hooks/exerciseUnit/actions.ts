/**
 * The work behind a sheet button: check an item (deterministic grade, or an AI
 * grade for an open answer, then one transaction), ask for a hint, ask for an
 * explanation. Every write carries the reset token the work started with. A
 * result that arrives after the learner left the unit or reset it is dropped
 * without a trace; a token moved by someone else (another tab) asks for a
 * reload. Does not own React state: `useExerciseUnit` supplies the context.
 */
import { fetchExplanation, fetchHint, gradeOpenAnswer, MissingApiKeyError } from '../../services/api';
import { checkItem, saveItemProgress, StaleResetError, type ItemProgress } from '../../storage/exercises';
import { expectedAnswerText, recordedAnswerText } from '../../services/exercises/answer';
import { gradeUnitItem } from '../../services/exercises/grading';
import { errorMessage } from '../../services/ai/errors';
import { practiceGrading } from '../../utils/appSettings';
import { effectiveItemType, type CheckedResult, type ExerciseItem, type ExerciseUnit } from '../../types/exercises';
import { aiErrorText } from '../../utils/aiErrorText';
import type { ItemRuntime } from './model';

export interface ActionContext {
  unit: ExerciseUnit;
  /** The reset token read when this work started. */
  token: number;
  item(itemId: string): ItemRuntime | undefined;
  patch(itemId: string, partial: Partial<ItemRuntime>): void;
  /** False once the learner left the unit or reset it. */
  isCurrent(): boolean;
  /** The token moved without us: reload what is stored. */
  onForeignReset(): void;
  onMissingKey(): void;
  /** A write that is not an answer (draft, hint flag) failed; the reason, or null once one succeeded. */
  onSaveError(message: string | null): void;
}

const findItem = (unit: ExerciseUnit, itemId: string): ExerciseItem | undefined =>
  unit.items.find((item) => item.id === itemId);

/** The words around an item that help a hint or an explanation: what the unit asks and its passage. */
const lessonContext = (unit: ExerciseUnit) =>
  [unit.instruction, unit.readingPassage?.content].filter(Boolean).join('\n') || undefined;

function fail(ctx: ActionContext, itemId: string, err: unknown) {
  if (!ctx.isCurrent()) return;
  if (err instanceof StaleResetError) return ctx.onForeignReset();
  if (err instanceof MissingApiKeyError) {
    ctx.patch(itemId, { busy: null, error: null });
    return ctx.onMissingKey();
  }
  ctx.patch(itemId, { busy: null, error: aiErrorText(err) });
}

/** Saves a flag (hint or explanation shown) after it was shown; a failure is reported, never hidden. */
async function saveFlag(ctx: ActionContext, itemId: string, progress: ItemProgress) {
  try {
    await saveItemProgress(ctx.unit.id, itemId, ctx.token, progress);
    if (ctx.isCurrent()) ctx.onSaveError(null);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err instanceof StaleResetError) ctx.onForeignReset();
    else ctx.onSaveError(errorMessage(err));
  }
}

export async function runCheck(ctx: ActionContext, itemId: string) {
  const view = ctx.item(itemId);
  const item = findItem(ctx.unit, itemId);
  if (!view || !item || view.checked || view.busy) return;
  const answer = view.answer;
  ctx.patch(itemId, { busy: 'check', error: null });
  try {
    const grading = practiceGrading();
    const graded = gradeUnitItem(ctx.unit, item, answer, grading);
    let result: CheckedResult;
    if (graded.status === 'graded') {
      result = { correct: graded.correct, strictAccents: grading.strictAccents };
    } else {
      // An open answer that matched no reference: the verdict and the words come from the AI, never a score.
      const grade = await gradeOpenAnswer({
        prompt: item.prompt,
        expectedAnswer: expectedAnswerText(item),
        userAnswer: graded.recordedAnswer,
        context: lessonContext(ctx.unit),
      });
      if (!ctx.isCurrent()) return;
      result = {
        correct: grade.isCorrect,
        strictAccents: grading.strictAccents,
        aiFeedback: {
          feedback: grade.feedback,
          ...(grade.correctedVersion ? { correctedVersion: grade.correctedVersion } : {}),
        },
      };
    }
    const outcome = await checkItem({ unitId: ctx.unit.id, itemId, resetToken: ctx.token, answer, result });
    if (!ctx.isCurrent()) return;
    ctx.patch(itemId, { checked: outcome.state.checked, answer: outcome.state.answer, busy: null });
  } catch (err) {
    fail(ctx, itemId, err);
  }
}

export async function runHint(ctx: ActionContext, itemId: string) {
  const view = ctx.item(itemId);
  const item = findItem(ctx.unit, itemId);
  if (!view || !item || view.checked || view.busy) return;
  const type = effectiveItemType(item, ctx.unit);
  ctx.patch(itemId, { busy: 'hint', error: null });
  try {
    const hint = await fetchHint({
      exerciseType: type,
      prompt: item.prompt,
      userAnswer: recordedAnswerText(type, item, view.answer),
      grammarTag: item.grammarTag,
      context: lessonContext(ctx.unit),
    });
    if (!ctx.isCurrent()) return;
    ctx.patch(itemId, { hint, hintShown: true, busy: null });
    await saveFlag(ctx, itemId, { hintShown: true });
  } catch (err) {
    fail(ctx, itemId, err);
  }
}

export async function runExplanation(ctx: ActionContext, itemId: string) {
  const view = ctx.item(itemId);
  const item = findItem(ctx.unit, itemId);
  if (!view || !item || !view.checked || view.checked.correct || view.busy || view.explanation) return;
  const type = effectiveItemType(item, ctx.unit);
  ctx.patch(itemId, { busy: 'explain', error: null });
  try {
    const explanation = await fetchExplanation({
      prompt: item.prompt,
      userAnswer: recordedAnswerText(type, item, view.answer),
      expectedAnswer: expectedAnswerText(item),
      grammarTag: item.grammarTag,
      context: lessonContext(ctx.unit),
    });
    if (!ctx.isCurrent()) return;
    ctx.patch(itemId, { explanation, explanationShown: true, busy: null });
    await saveFlag(ctx, itemId, { explanationShown: true });
  } catch (err) {
    fail(ctx, itemId, err);
  }
}
