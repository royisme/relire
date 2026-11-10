/**
 * The sentence workshop's flow: theme picker, then a round, then its summary.
 * Owns the full-bleed stage, the way out, the round load (with the next round prefetched from the
 * second-to-last turn), the unit each round saves and the one record an item gets; the brick game is
 * `RoundView`, the AI (or the dev fixture) is the `source` prop.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import { useUnitSaver } from '../../hooks/useUnitSaver';
import { errorMessage } from '../../services/ai/errors';
import type { AtelierSource, RoundChoice } from '../../services/atelier/source';
import { emptyAnswer } from '../../services/exercises/answer';
import { prepareAtelierUnit } from '../../services/exercises/fromAtelier';
import { loadThemes } from '../../services/themes/load';
import { checkItem, getResetToken } from '../../storage/exercises';
import type { AtelierItem } from '../../types/atelier';
import type { ExerciseUnit } from '../../types/exercises';
import type { Theme } from '../../types/themes';
import { RoundView } from './RoundView';
import { Stage } from './Stage';
import { ThemePicker } from './ThemePicker';

interface Round {
  items: AtelierItem[];
  choice: RoundChoice;
  dropped: number;
  /** Bumped per round, so "Play again" starts a fresh one. */
  id: number;
}

/** A round as a source hands it over. */
type LoadedRound = { items: AtelierItem[]; dropped: number };

/** What a played round records against: its saved unit, the unit's reset token, and which items already have their one record. */
interface Records {
  unit: ExerciseUnit;
  token: number;
  done: Set<number>;
}

export function AtelierScreen({ source }: { source: AtelierSource }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const { status, save, drop } = useUnitSaver();
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [picked, setPicked] = useState<RoundChoice | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The real reason a check or a reveal could not be recorded; an overlay, so nothing on screen moves. */
  const [recordError, setRecordError] = useState<string | null>(null);
  const nextId = useRef(1);
  const records = useRef<Records | null>(null);
  /** The next round for the choice on screen, loading in the background since the second-to-last turn. */
  const prefetched = useRef<{ choice: RoundChoice; round: Promise<LoadedRound> } | null>(null);

  useEffect(() => {
    loadThemes().then(setThemes, (reason: unknown) => setThemesError(errorMessage(reason)));
  }, []);

  /**
   * The round a choice plays next: the prefetched one when it is still for that choice — ready or not, it is
   * waited for — and a fresh load when the prefetch failed or the choice moved on to another theme or level.
   */
  const nextRound = async (choice: RoundChoice): Promise<LoadedRound> => {
    const kept = prefetched.current;
    prefetched.current = null;
    if (kept && kept.choice.themeId === choice.themeId && kept.choice.level === choice.level) {
      try {
        return await kept.round;
      } catch {
        // The background round failed; the fresh load below shows its own real error, if it fails too.
      }
    }
    return source.loadRound(choice);
  };

  const start = async (choice: RoundChoice) => {
    setPicked(choice);
    setLoading(true);
    setError(null);
    setRecordError(null);
    // A failed save keeps its batch in the saver; a later round must never save that stale unit.
    drop();
    try {
      const { items, dropped } = await nextRound(choice);
      if (items.length === 0) {
        setError(t('atelier.pick.noneUsable', { count: dropped }));
        return;
      }
      // Like Gender, the round is not played before its unit is saved: recording needs the unit and its token.
      const units = await save(() => [
        prepareAtelierUnit(items, { themeId: choice.themeId, level: choice.level, language, t }),
      ]);
      const unit = units?.[0];
      if (!unit) return; // The save failed; its real reason shows in the picker.
      const token = await getResetToken(unit.id);
      records.current = { unit, token, done: new Set() };
      setRound({ items, choice, dropped, id: nextId.current++ });
    } catch (reason) {
      setError(t('atelier.pick.loadFailed', { msg: errorMessage(reason) }));
    } finally {
      setLoading(false);
    }
  };

  /** Loads the next round of the same choice in the background; one prefetch per round, dropped when the game is left. */
  const prefetch = useCallback(
    (choice: RoundChoice) => {
      if (prefetched.current) return;
      const pending = source.loadRound(choice);
      // The rejection is dealt with when the round is taken; without a handler here it would be unhandled.
      void pending.catch(() => undefined);
      prefetched.current = { choice, round: pending };
    },
    [source],
  );

  /**
   * The one record an item gets: its first check's verdict, or — for an item revealed with no check behind
   * it — the row as it stood, counted wrong. A write that fails gives the item back, so a later check retries.
   */
  const record = useCallback(async (itemIndex: number, answer: string, correct: boolean) => {
    const held = records.current;
    const item = held?.unit.items[itemIndex];
    if (!held || !item || held.done.has(itemIndex)) return;
    held.done.add(itemIndex);
    try {
      await checkItem({
        unitId: held.unit.id,
        itemId: item.id,
        resetToken: held.token,
        answer: { ...emptyAnswer(item), singleAnswer: answer },
        result: { correct, strictAccents: true },
      });
      setRecordError(null);
    } catch (reason) {
      held.done.delete(itemIndex);
      setRecordError(errorMessage(reason));
    }
  }, []);

  const leave = () => navigate({ name: 'grammar' });
  let screen: ReactNode;
  if (themesError)
    screen = (
      <p role="alert" className="break-words p-4 text-sm text-bad-700">
        {themesError}
      </p>
    );
  else if (!themes) screen = <p className="p-4 text-sm text-ink-600">{t('common.loading')}</p>;
  else if (round && picked)
    screen = (
      <RoundView
        key={round.id}
        items={round.items}
        choice={round.choice}
        dropped={round.dropped}
        source={source}
        onPrefetch={prefetch}
        onAgain={() => {
          setRound(null);
          void start(picked);
        }}
        onThemes={() => setRound(null)}
        onLeave={leave}
        onRecord={(itemIndex, answer, correct) => void record(itemIndex, answer, correct)}
      />
    );
  else
    screen = (
      <ThemePicker
        themes={themes}
        loading={loading}
        error={error ?? (status.kind === 'error' ? status.message : null)}
        initial={picked}
        onStart={(next) => void start(next)}
        onLeave={leave}
      />
    );
  return (
    <Stage>
      {recordError && (
        <p
          role="alert"
          className="atelier-slip pointer-events-none absolute inset-x-3 top-2 z-10 break-words"
          data-kind="bad"
        >
          {recordError}
        </p>
      )}
      {screen}
    </Stage>
  );
}
