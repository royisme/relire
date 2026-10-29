/**
 * The sentence workshop's flow: theme picker, then a round, then its summary.
 * Owns the stage and the one round load; the brick game is `RoundView`, the AI
 * (or the dev fixture) is the `source` prop.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../services/ai/errors';
import { resolveChoice, type AtelierSource, type RoundChoice, type RoundPicks } from '../../services/atelier/source';
import { loadThemes } from '../../services/themes/load';
import type { AtelierItem } from '../../types/atelier';
import type { Theme } from '../../types/themes';
import { RoundView } from './RoundView';
import { ThemePicker } from './ThemePicker';

interface Round {
  items: AtelierItem[];
  choice: RoundChoice;
  dropped: number;
  /** Bumped per round, so "Play again" starts a fresh one. */
  id: number;
}

export function AtelierScreen({ source }: { source: AtelierSource }) {
  const { t } = useTranslation();
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [picks, setPicks] = useState<RoundPicks | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    loadThemes().then(setThemes, (reason: unknown) => setThemesError(errorMessage(reason)));
  }, []);

  const start = async (next: RoundPicks) => {
    if (!themes) return;
    setPicks(next);
    setLoading(true);
    setError(null);
    const choice = resolveChoice(
      themes.find((theme) => theme.id === next.themeId)!,
      next,
      Math.random,
    );
    try {
      const { items, dropped } = await source.loadRound(choice);
      if (items.length === 0) setError(t('atelier.pick.noneUsable', { count: dropped }));
      else setRound({ items, choice, dropped, id: nextId.current++ });
    } catch (reason) {
      setError(t('atelier.pick.loadFailed', { msg: errorMessage(reason) }));
    } finally {
      setLoading(false);
    }
  };

  if (themesError)
    return (
      <p role="alert" className="break-words text-sm text-bad-700">
        {themesError}
      </p>
    );
  if (!themes) return <p className="text-sm text-ink-500">{t('common.loading')}</p>;
  if (round && picks)
    return (
      <RoundView
        key={round.id}
        items={round.items}
        choice={round.choice}
        dropped={round.dropped}
        source={source}
        onAgain={() => {
          setRound(null);
          void start(picks);
        }}
        onThemes={() => setRound(null)}
      />
    );
  return (
    <ThemePicker themes={themes} loading={loading} error={error} initial={picks} onStart={(next) => void start(next)} />
  );
}
