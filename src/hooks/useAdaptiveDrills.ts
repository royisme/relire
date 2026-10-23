/** Adaptive generation and durable-first save. Failed writes retain the exact prepared payload; late AI results never save. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { generateAdaptiveDrills, MissingApiKeyError } from '../services/api';
import { MAX_RECENT_MISTAKES } from '../services/ai/prompts';
import { prepareDrills } from '../services/exercises/fromDrills';
import { listMistakes, saveUnits } from '../storage/exercises';
import type { ExerciseLevel, ExerciseUnit } from '../types/exercises';
import type { GrammarTag } from '../types/grammar';
import { aiErrorText } from '../utils/aiErrorText';
import { useImportGuard } from './useImportGuard';
import { navigate } from './useRoute';

export function useAdaptiveDrills(onMissingKey: () => void) {
  const [phase, setPhase] = useState<'idle' | 'generating' | 'saving'>('idle');
  const [prepared, setPrepared] = useState<ExerciseUnit | null>(null);
  const payload = useRef<ExerciseUnit | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const session = useRef(0);
  const endSession = useCallback(() => {
    session.current++;
  }, []);
  useEffect(() => {
    endSession();
    return endSession;
  }, [endSession]);
  function discard() {
    if (busy.current) return;
    payload.current = null;
    setPrepared(null);
    setError('');
  }
  const guard = useImportGuard(!!prepared, phase === 'saving', discard);
  async function persist(mine: number, result: ExerciseUnit) {
    setPhase('saving');
    try {
      await saveUnits([result]);
      if (mine !== session.current) return;
      guard.release();
      payload.current = null;
      setPrepared(null);
      navigate({ name: 'unit', area: result.learningArea, unitId: result.id });
    } catch (err) {
      if (mine === session.current) setError(aiErrorText(err));
    }
  }
  async function make(targets: GrammarTag[], level: ExerciseLevel, count: number) {
    if (busy.current || payload.current || !targets.length) return;
    busy.current = true;
    const mine = session.current;
    setPhase('generating');
    setError('');
    try {
      const mistakes = await listMistakes();
      if (mine !== session.current) return;
      const recentMistakes = mistakes
        .filter(({ attempt }) => attempt.learningArea === 'grammar' && targets.includes(attempt.grammarTag))
        .slice(0, MAX_RECENT_MISTAKES)
        .map(({ attempt: { prompt, userAnswer, expectedAnswer } }) => ({ prompt, userAnswer, expectedAnswer }));
      const drills = await generateAdaptiveDrills({ targets, level, count, recentMistakes });
      if (mine !== session.current) return;
      const result = prepareDrills(drills, targets, level);
      payload.current = result;
      setPrepared(result);
      await persist(mine, result);
    } catch (err) {
      if (mine !== session.current) return;
      if (err instanceof MissingApiKeyError) onMissingKey();
      else setError(aiErrorText(err));
    } finally {
      busy.current = false;
      if (mine === session.current) setPhase('idle');
    }
  }
  async function retry() {
    if (busy.current || !payload.current) return;
    busy.current = true;
    const mine = session.current;
    setError('');
    try {
      await persist(mine, payload.current);
    } finally {
      busy.current = false;
      if (mine === session.current) setPhase('idle');
    }
  }
  return { phase, prepared, error, make, retry, discard, guard };
}
