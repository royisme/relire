/** Transient post-check word practice; the shared recorder owns capture/assessment, with no saved takes or stats. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { choiceGroups } from '../../services/exercises/answer';
import type { ExerciseItem } from '../../types/exercises';
import { ShadowingRecorder } from '../shadowing/ShadowingRecorder';
import { Segmented } from '../ui/segmented';

export function PairsReadAloud({ item }: { item: ExerciseItem }) {
  const { t } = useTranslation();
  const words = choiceGroups(item.prompt)[0];
  const [word, setWord] = useState(words[0]);

  return (
    <section aria-label={t('minimalPairs.readAloud.title')} className="min-w-0 space-y-3 border-t border-ink-200 pt-3">
      <h3 className="font-serif text-lg font-semibold text-ink-900">{t('minimalPairs.readAloud.title')}</h3>
      <p className="break-words text-sm text-ink-600">{t('minimalPairs.readAloud.guide')}</p>
      <Segmented
        label={t('minimalPairs.readAloud.word')}
        options={words.map((value) => ({ value, label: value }))}
        value={word}
        onChange={setWord}
      />
      <ShadowingRecorder key={word} referenceText={word} />
    </section>
  );
}
