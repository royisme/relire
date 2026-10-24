/** Owns gathering Today's step inputs (the shared vocabulary model, the reader hooks, exercise storage, the optional topic list), not selection or presentation. */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../services/ai/errors';
import { loadGrammarTopics } from '../services/grammarTopics/load';
import { contentServiceUrl } from '../services/grammarTopics/service';
import {
  mistakeAttemptsToday,
  readerIdsActiveToday,
  soundAttemptsToday,
  startOfLocalDay,
} from '../services/today/activity';
import { grammarInput, readerEntries, wordsInput } from '../services/today/inputs';
import { buildTodayPlan, type TodayGrammar, type TodayInput, type TodayPlan } from '../services/today/plan';
import { getVocabularyBook } from '../storage/vocabularyBook';
import { getUnit, listAttemptsSince, listMistakes, subscribeExercises } from '../storage/exercises';
import { listTopicStudied, subscribeTopicStudied } from '../storage/topicStudied';
import type { ExerciseAttempt, ExerciseUnit } from '../types/exercises';
import { useGradedReaders } from './useGradedReaders';
import { useReaderCatalogue } from './useReaderCatalogue';
import { useReaderProgress } from './useReaderProgress';
import type { VocabularyModel } from './useVocabulary';

/** Sound and mistakes share one attempts read; a failure fails both steps together. */
interface PracticeData {
  today: ExerciseAttempt[];
  wrongBefore: Set<string>;
  unitsById: Map<string, ExerciseUnit>;
  unresolved: number;
}

export function useToday(
  vocabulary: VocabularyModel,
): { status: 'loading' } | { status: 'ready'; plan: TodayPlan; now: number } {
  const now = vocabulary.now;

  // The queue join reads the cached book only (never a download); the shared model owns readiness and `now`.
  const [words, setWords] = useState<{ value: ReturnType<typeof wordsInput> } | { error: string } | null>(null);
  useEffect(() => {
    if (vocabulary.error !== null || !vocabulary.ready) return;
    let live = true;
    let sequence = 0;
    void (async () => {
      const request = ++sequence;
      try {
        const book = await getVocabularyBook();
        if (!live || request !== sequence) return;
        setWords({ value: wordsInput(vocabulary.rows, book, vocabulary.day, vocabulary.preferences.newPerDay, now) });
      } catch (err) {
        if (live && request === sequence) setWords({ error: errorMessage(err) });
      }
    })();
    return () => {
      live = false;
      sequence++;
    };
  }, [vocabulary.error, vocabulary.ready, vocabulary.rows, vocabulary.day, vocabulary.preferences, now]);

  // The starters and the progress read decide readiness; the service catalogue joins whenever it lands.
  const starters = useGradedReaders();
  const catalogue = useReaderCatalogue(starters.readers);
  const progress = useReaderProgress();
  const readers = useMemo<TodayInput['readers'] | null>(() => {
    if (starters.status === 'error' && starters.error !== undefined) return { error: starters.error };
    if (starters.status !== 'ready') return null; // `ready` implies the pack is loaded
    if (progress.error !== undefined) return { error: progress.error };
    if (progress.rows === undefined) return null;
    return {
      value: readerEntries(
        starters.readers!,
        catalogue.status === 'ready' ? catalogue.readers! : [],
        progress.rows,
        now,
      ),
    };
  }, [
    starters.status,
    starters.error,
    starters.readers,
    progress.error,
    progress.rows,
    catalogue.status,
    catalogue.readers,
    now,
  ]);

  // The readers-worked-today count reads progress rows only: checked after the step join above, so a
  // starter or catalogue failure must not mask the progress read's own error or turn the count into 0.
  const readerCount = useMemo<TodayInput['counts']['readers'] | null>(() => {
    if (progress.error !== undefined) return { error: progress.error };
    if (progress.rows === undefined) return null;
    return { value: readerIdsActiveToday(progress.rows, now).size };
  }, [progress.error, progress.rows, now]);

  const [practice, setPractice] = useState<PracticeData | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      try {
        const { today, wrongBefore } = await listAttemptsSince(startOfLocalDay(now));
        const ids = [...new Set(today.map(({ unitId }) => unitId))];
        const found = new Map<string, ExerciseUnit>();
        for (const [id, unit] of await Promise.all(ids.map(async (id) => [id, await getUnit(id)] as const)))
          if (unit) found.set(id, unit);
        const entries = await listMistakes();
        if (!live || request !== sequence) return;
        setPractice({
          today,
          wrongBefore,
          unitsById: found,
          unresolved: entries.filter((entry) => !entry.resolved).length,
        });
      } catch (err) {
        if (live && request === sequence) setPractice({ error: errorMessage(err) });
      }
    };
    const unsubscribe = subscribeExercises(() => void load());
    void load();
    return () => {
      live = false;
      sequence++;
      unsubscribe();
    };
  }, [now]);

  // Without a content service there are no topics at all: no request, no grammar step. While the list loads
  // the four local steps stand on their own; the step joins once the list resolves.
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const grammarConfigured = contentServiceUrl() !== undefined;
  const [grammar, setGrammar] = useState<{ value: TodayGrammar } | { error: string } | null>(null);
  useEffect(() => {
    if (!grammarConfigured) return;
    let live = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      try {
        const [list, studied] = await Promise.all([loadGrammarTopics(), listTopicStudied()]);
        if (!live || request !== sequence) return;
        setGrammar({ value: grammarInput(list, studied, now, language) });
      } catch (err) {
        if (live && request === sequence) setGrammar({ error: errorMessage(err) });
      }
    };
    const unsubscribe = subscribeTopicStudied(() => void load());
    void load();
    return () => {
      live = false;
      sequence++;
      unsubscribe();
    };
  }, [grammarConfigured, now, language]);

  const plan = useMemo(() => {
    // A model read error is the words step's own error even though no book was ever loaded.
    const wordsSource =
      vocabulary.error !== null
        ? { error: vocabulary.error }
        : words === null
          ? null
          : 'error' in words
            ? { error: words.error }
            : { value: words.value };
    if (wordsSource === null || readers === null || practice === null || readerCount === null) return null;
    const input: TodayInput = {
      words: wordsSource,
      readers,
      sound:
        'error' in practice
          ? { error: practice.error }
          : { value: { attemptsToday: soundAttemptsToday(practice.today, practice.unitsById, now) } },
      mistakes:
        'error' in practice
          ? { error: practice.error }
          : {
              value: {
                unresolved: practice.unresolved,
                attemptsToday: mistakeAttemptsToday(practice.today, practice.wrongBefore, now),
              },
            },
      // One count over the single attempts list the hook already holds; the sound and mistake step
      // counters overlap and miss other exercises, so they are never summed.
      counts: {
        exercises: 'error' in practice ? { error: practice.error } : { value: practice.today.length },
        readers: readerCount,
      },
      // `null` is a pending or unconfigured list: the plan omits the step rather than blocking the rest.
      ...(grammar !== null ? { grammar } : {}),
    };
    return buildTodayPlan(input);
  }, [vocabulary.error, words, readers, readerCount, practice, grammar, now]);

  return plan ? { status: 'ready', plan, now } : { status: 'loading' };
}
