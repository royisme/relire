/** Counts for saved sound-pair items only; owns the live read, not grading or persisted history. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { countsBySoundContrast, subscribeExercises, type ContrastCount } from '../../storage/exercises';
import { aiErrorText } from '../../utils/aiErrorText';

export function SoundContrastCounts() {
  const { t } = useTranslation();
  const [state, setState] = useState<{ counts: ContrastCount[]; loading: boolean; error: string }>({
    counts: [],
    loading: true,
    error: '',
  });
  useEffect(() => {
    let revision = 0;
    let live = true;
    async function read() {
      const mine = ++revision;
      setState({ counts: [], loading: true, error: '' });
      try {
        const counts = await countsBySoundContrast();
        if (live && mine === revision) setState({ counts, loading: false, error: '' });
      } catch (error) {
        if (live && mine === revision) setState({ counts: [], loading: false, error: aiErrorText(error) });
      }
    }
    void read();
    const unsubscribe = subscribeExercises(() => void read());
    return () => {
      live = false;
      revision++;
      unsubscribe();
    };
  }, []);

  return (
    <section className="min-w-0 space-y-3" aria-labelledby="sound-contrast-title">
      <div>
        <h3 id="sound-contrast-title" className="font-serif font-semibold text-lg text-ink-900">
          {t('minimalPairs.progress.title')}
        </h3>
        <p className="text-sm text-ink-600 mt-0.5 break-words">{t('minimalPairs.progress.history')}</p>
      </div>
      <dl className="h-72 overflow-y-auto divide-y divide-ink-200" aria-busy={state.loading}>
        {state.counts.map(({ contrast, correct, total }) => {
          const [first, second] = contrast.split('-');
          return (
            <div key={contrast} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <dt className="text-ink-800">{t('minimalPairs.progress.contrast', { first, second })}</dt>
              <dd className="text-ink-700 tnum">{t('minimalPairs.progress.counts', { correct, total })}</dd>
            </div>
          );
        })}
      </dl>
      <p
        role="status"
        className={`h-16 overflow-auto text-sm break-words ${state.error ? 'text-bad-700' : 'text-ink-600'}`}
      >
        {state.error
          ? t('exerciseProgress.readFailed', { reason: state.error })
          : state.loading
            ? t('exerciseProgress.loading')
            : !state.counts.length
              ? t('minimalPairs.progress.empty')
              : ''}
      </p>
    </section>
  );
}
