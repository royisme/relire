/**
 * "Make exercises from this article": asks for a set (always a new one, since
 * the learner pressed the button), turns it into stored units with fresh ids
 * and saves them. The screen shows the state on the button and in one status
 * line; a missing key is handed to the caller, which opens Settings. Late
 * results after the learner moved on are still saved (the AI call was paid
 * for) but touch no screen state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { generateExercises, MissingApiKeyError } from '../services/api';
import { toStoredUnits } from '../services/exercises/fromGenerated';
import { listUnits, saveUnits } from '../storage/exercises';
import type { Article } from '../types';
import { aiErrorText } from '../utils/aiErrorText';

export interface GenerationOptions {
  level: string;
  count: number;
}

export type GenerationState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'error'; message: string }
  /** `items` were saved in `units` units; `dropped` could not be checked against the article and were left out. */
  | { status: 'done'; units: number; items: number; dropped: number };

export function useExerciseGeneration(article: Article, onMissingKey: () => void) {
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  const session = useRef(0);
  const working = useRef(false);

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
        const set = await generateExercises({ articleText: article.content, count, level }, true);
        // Numbers continue after the units the article already has, so the list keeps its order.
        const existing = await listUnits(article.id);
        const firstNumber = existing.reduce((highest, unit) => Math.max(highest, unit.unitNumber), 0) + 1;
        const saved = await saveUnits(article.id, toStoredUnits(set.units, { firstNumber }));
        if (mine !== session.current) return;
        setState({
          status: 'done',
          units: saved.length,
          items: saved.reduce((sum, unit) => sum + unit.items.length, 0),
          dropped: set.dropped,
        });
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
    [article.content, article.id, onMissingKey],
  );

  return { state, make };
}
