/** Invented TEST G5 coverage: y and moi enter the function-word inventory at stage 3; unlisted words never do. */
import { expect, test } from 'bun:test';
import { checkDraft } from '../scripts/graded-readers/gates';
import type { GateContext } from '../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../scripts/graded-readers/drafts';
import { stageInventoryFixture } from './fixtures/gradedReaderStageInventory';

const inventory = 'Core function is not yet introduced in the stage inventory';
/** Rejections must trip G5 alone, and every diagnostic must point at the word under test. */
const inventoryReasons = (draft: ReaderDraft, context: GateContext, word: string) => {
  const diagnostics = checkDraft(draft, context);
  expect(diagnostics.filter((diagnostic) => diagnostic.gate !== 'G5')).toEqual([]);
  const rejections = diagnostics.filter((diagnostic) => diagnostic.gate === 'G5');
  // The title occurrence keeps its source capitalization (Moi); attribution is case-insensitive.
  expect(rejections.map((diagnostic) => diagnostic.spelling.toLowerCase())).toEqual(rejections.map(() => word));
  return [...new Set(rejections.map((diagnostic) => diagnostic.reason))];
};

// (e) y (il y a) and moi (c’est moi) are stage 3 patterns: accepted there, one stage too early everywhere else is fatal.
for (const word of ['y', 'moi'] as const) {
  test(`G5 TEST ${word} is accepted at stage 3`, () => {
    const { draft, context } = stageInventoryFixture(word, 3);
    expect(checkDraft(draft, context)).toEqual([]);
  });
  test(`G5 TEST ${word} is rejected at stage 2`, () => {
    const { draft, context } = stageInventoryFixture(word, 2);
    expect(inventoryReasons(draft, context, word)).toEqual([inventory]);
  });
}

// (e) a core headword absent from the introduced table fails closed at every stage.
for (let order = 1; order <= 12; order++)
  test(`G5 TEST unlisted très is rejected at stage ${order}`, () => {
    const { draft, context } = stageInventoryFixture('très', order);
    expect(inventoryReasons(draft, context, 'très')).toEqual([inventory]);
  });
