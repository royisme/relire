/** Exercise button actions: real storage transactions, mocked AI, and late-result boundaries. */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { freshDb, putArticle } from './fixtures/storage';
import { ITEMS, unitOf } from './fixtures/units';
import * as api from '../src/services/api';
import * as appSettings from '../src/utils/appSettings';
import { runCheck, runExplanation, runHint, type ActionContext } from '../src/hooks/exerciseUnit/actions';
import { emptyItems } from '../src/hooks/exerciseUnit/model';
import { getUnitSnapshot, listAttempts, resetUnit, saveUnits } from '../src/storage/exercises';
import type { OpenGrade } from '../src/types/exerciseAi';
import type { ExerciseUnit } from '../src/types/exercises';

beforeEach(freshDb);
afterEach(() => mock.restore());

const grade: OpenGrade = { isCorrect: true, feedback: 'Another valid wording.' };

async function seed(type: ExerciseUnit['type'] = 'OPEN_QA') {
  await putArticle();
  const [unit] = await saveUnits('material-1', [unitOf(type)]);
  const items = emptyItems(unit);
  const id = unit.items[0].id;
  items[id].answer.singleAnswer = 'Une autre réponse.';
  let current = true;
  const onForeignReset = mock(() => {});
  const onSaveError = mock((_message: string | null) => {});
  const ctx: ActionContext = {
    unit,
    token: 0,
    item: (itemId) => items[itemId],
    patch: mock((itemId, patch) => Object.assign(items[itemId], patch)),
    isCurrent: () => current,
    onForeignReset,
    onMissingKey: mock(() => {}),
    onSaveError,
  };
  return { ctx, id, items, onForeignReset, onSaveError, leave: () => (current = false) };
}

test('runCheck commits a reference match without AI and an unmatched answer with AI feedback', async () => {
  const { ctx, id, items } = await seed();
  const ai = spyOn(api, 'gradeOpenAnswer').mockResolvedValue(grade);
  items[id].answer.singleAnswer = String(ITEMS.OPEN_QA.expectedAnswer);
  await runCheck(ctx, id);
  expect(ai).not.toHaveBeenCalled();
  expect((await getUnitSnapshot(ctx.unit.id)).states[0].checked).toEqual({ correct: true, strictAccents: false });

  const nextToken = await resetUnit(ctx.unit.id);
  ctx.token = nextToken;
  items[id] = emptyItems(ctx.unit)[id];
  items[id].answer.singleAnswer = 'Une autre réponse.';
  await runCheck(ctx, id);
  expect(ai).toHaveBeenCalledTimes(1);
  const snapshot = await getUnitSnapshot(ctx.unit.id);
  expect(snapshot.states[0].checked).toEqual({
    correct: true,
    strictAccents: false,
    aiFeedback: { feedback: grade.feedback },
  });
  expect(items[id].checked).toEqual(snapshot.states[0].checked);
  expect(await listAttempts()).toHaveLength(2);
});

for (const strictAccents of [false, true]) {
  test(`runCheck snapshots strict accents=${strictAccents} before a local or pending AI grade`, async () => {
    const settings = spyOn(appSettings, 'practiceGrading').mockReturnValue({ strictAccents });
    const { ctx, id, items } = await seed();
    items[id].answer.singleAnswer = String(ITEMS.OPEN_QA.expectedAnswer);
    await runCheck(ctx, id);
    expect((await getUnitSnapshot(ctx.unit.id)).states[0].checked).toEqual({ correct: true, strictAccents });
    ctx.token = await resetUnit(ctx.unit.id);
    items[id] = emptyItems(ctx.unit)[id];
    items[id].answer.singleAnswer = 'Une autre réponse.';
    const pending = Promise.withResolvers<OpenGrade>();
    spyOn(api, 'gradeOpenAnswer').mockReturnValue(pending.promise);
    const checking = runCheck(ctx, id);
    settings.mockReturnValue({ strictAccents: !strictAccents });
    pending.resolve({ ...grade, isCorrect: !strictAccents });
    await checking;
    expect((await getUnitSnapshot(ctx.unit.id)).states[0].checked).toEqual({
      correct: !strictAccents,
      strictAccents,
      aiFeedback: { feedback: grade.feedback },
    });
  });
}

for (const reason of ['reset', 'leave'] as const) {
  test(`runCheck drops an AI grade after ${reason}, without a write or an error`, async () => {
    const { ctx, id, leave, onForeignReset } = await seed();
    const pending = Promise.withResolvers<OpenGrade>();
    spyOn(api, 'gradeOpenAnswer').mockReturnValue(pending.promise);
    const checking = runCheck(ctx, id);
    if (reason === 'reset') await resetUnit(ctx.unit.id);
    leave();
    const patches = mock(() => {});
    ctx.patch = patches;
    pending.resolve(grade);
    await checking;
    expect(patches).not.toHaveBeenCalled();
    expect(onForeignReset).not.toHaveBeenCalled();
    expect((await getUnitSnapshot(ctx.unit.id)).states).toEqual([]);
    expect(await listAttempts()).toEqual([]);
  });
}

test('runCheck requests a reload when another writer moved the reset token during AI grading', async () => {
  const { ctx, id, items, onForeignReset } = await seed();
  const pending = Promise.withResolvers<OpenGrade>();
  spyOn(api, 'gradeOpenAnswer').mockReturnValue(pending.promise);
  const checking = runCheck(ctx, id);
  await resetUnit(ctx.unit.id);
  pending.resolve(grade);
  await checking;
  expect(onForeignReset).toHaveBeenCalledTimes(1);
  expect(items[id].checked).toBeNull();
  expect(items[id].error).toBeNull();
  expect(await listAttempts()).toEqual([]);
});

for (const action of ['hint', 'explanation'] as const) {
  test(`run ${action} drops help that arrives after leaving, including its saved flag`, async () => {
    const hint = Promise.withResolvers<Awaited<ReturnType<typeof api.fetchHint>>>();
    const explanation = Promise.withResolvers<Awaited<ReturnType<typeof api.fetchExplanation>>>();
    spyOn(api, 'fetchHint').mockReturnValue(hint.promise);
    spyOn(api, 'fetchExplanation').mockReturnValue(explanation.promise);
    const { ctx, id, items, leave } = await seed();
    if (action === 'explanation') items[id].checked = { correct: false };
    const work = action === 'hint' ? runHint(ctx, id) : runExplanation(ctx, id);
    leave();
    const patches = mock(() => {});
    ctx.patch = patches;
    hint.resolve({ hint: 'Check the subject.', grammarRule: 'Subject agreement.' });
    explanation.resolve({ summary: 'Subject agreement.', details: 'Look at the subject.', tip: 'Check the subject.' });
    await work;
    expect(patches).not.toHaveBeenCalled();
    expect((await getUnitSnapshot(ctx.unit.id)).states).toEqual([]);
  });
}

test('a successful help flag save clears the previous save error', async () => {
  const { ctx, id, onSaveError } = await seed('FILL_BLANKS');
  spyOn(api, 'fetchHint').mockResolvedValue({ hint: 'Check the subject.', grammarRule: 'Subject agreement.' });
  await runHint(ctx, id);
  expect(onSaveError).toHaveBeenCalledWith(null);
  expect((await getUnitSnapshot(ctx.unit.id)).states[0].hintShown).toBe(true);
  expect(await listAttempts()).toEqual([]);
});
