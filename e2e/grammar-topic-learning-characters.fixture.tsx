/** Real-DOM workbench harness: session transitions commit without unrelated app renders. */
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { TopicWorkbench } from '../src/components/practice/TopicWorkbench';
import { emptyItems, sheetProgress } from '../src/hooks/exerciseUnit/model';
import { topicToExerciseUnit } from '../src/services/grammarTopics/checkpoints';
import { learningFixture } from '../tests/fixtures/grammarLearning';
import type { ExerciseUnitSession } from '../src/hooks/useExerciseUnit';

const unit = topicToExerciseUnit(learningFixture(), 'a'.repeat(64), 1);

function CharacterWorkbench() {
  const [items, setItems] = useState(() => emptyItems(unit));
  const session: ExerciseUnitSession = {
    status: 'ready',
    loadError: null,
    unit,
    items,
    progress: sheetProgress(unit, items),
    saveError: null,
    setAnswer: (id, answer) => setItems((current) => ({ ...current, [id]: { ...current[id], answer } })),
    check: async (id) => {
      // Model the pending and committed saves as distinct commits, as real async storage does.
      flushSync(() => setItems((current) => ({ ...current, [id]: { ...current[id], busy: 'check' } })));
      setItems((current) => ({
        ...current,
        [id]: { ...current[id], busy: null, checked: { correct: true, strictAccents: true } },
      }));
    },
    resetItem: async (id) => setItems((current) => ({ ...current, [id]: emptyItems(unit)[id] })),
    checkAll: async () => {},
    requestHint: async () => {},
    requestExplanation: async () => {},
    reset: async () => false,
    canReset: true,
    retrySave: () => {},
    resetting: false,
    resetError: null,
    reload: () => {},
  };
  return <TopicWorkbench session={session} />;
}

export function mountCharacterWorkbench() {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  createRoot(container).render(<CharacterWorkbench />);
}
