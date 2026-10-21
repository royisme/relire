/**
 * "Make exercises from this article": asks for a set (always a new batch, since
 * the learner pressed the button), turns it into stored units with fresh ids
 * and saves them. The batch is titled with the article's title and keeps no
 * link to it. The screen shows the state on the button and in one status
 * line; a missing key is handed to the caller, which opens Settings. Late
 * results after the learner moved on are still saved (the AI call was paid
 * for) but touch no screen state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { generateExercises, MissingApiKeyError } from '../services/api';
import { toStoredUnits } from '../services/exercises/fromGenerated';
import { createUnitSaver } from './useUnitSaver';
import type { Article } from '../types';
import type { ExerciseLevel } from '../types/exercises';
import type { ArticleExerciseArea } from '../types/learningArea';
import { aiErrorText } from '../utils/aiErrorText';
import { cleanArticleTitle } from '../utils/i18nHelpers';

export interface GenerationOptions {
  level: ExerciseLevel;
  count: number;
}

export type GenerationState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'error'; message: string }
  /** `items` were saved in `units` units; `dropped` could not be checked against the article and were left out. */
  | { status: 'done'; units: number; items: number; dropped: number };

export function useExerciseGeneration(article: Article, learningArea: ArticleExerciseArea, onMissingKey: () => void) {
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  const session = useRef(0);
  const working = useRef(false);
  const [saver] = useState(createUnitSaver);
  const droppedCount = useRef(0);
  const [prepared, setPrepared] = useState(false);

  // Leaving the page (or the article) ends the session; the screen is keyed by article.
  const endSession = useCallback(() => {
    session.current++;
  }, []);
  useEffect(() => {
    endSession();
    return endSession;
  }, [endSession]);

  const make = useCallback(
    async ({ level, count }: GenerationOptions) => {
      if (working.current) return;
      working.current = true;
      const mine = session.current;
      setState({ status: 'working' });
      try {
        const saved = await saver.run(async () => {
          const set = await generateExercises({ articleText: article.content, count, level, learningArea }, true);
          droppedCount.current = set.dropped;
          if (mine === session.current) setPrepared(true);
          return toStoredUnits(set.units, {
            setId: crypto.randomUUID(),
            setTitle: cleanArticleTitle(article.title) || undefined,
            level,
            createdAt: Date.now(),
          });
        });
        if (mine !== session.current || !saved) return;
        setPrepared(false);
        setState({
          status: 'done',
          units: saved.length,
          items: saved.reduce((sum, unit) => sum + unit.items.length, 0),
          dropped: droppedCount.current,
        });
        return true;
      } catch (err) {
        if (mine !== session.current) return;
        if (err instanceof MissingApiKeyError) {
          setState({ status: 'idle' });
          onMissingKey();
          return;
        }
        setState({ status: 'error', message: aiErrorText(err) });
      } finally {
        working.current = false;
      }
    },
    [article.content, article.title, learningArea, onMissingKey, saver],
  );

  return { state, make, prepared };
}
