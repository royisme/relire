/** One transient review visit: authoritative captures, durable reveal/rating, retry identity and exclusions. */
import { useEffect, useRef, useState } from 'react';
import type { VocabularyBook, VocabularyRow, VocabularyTokens, VocabularyOutcome } from '../types/vocabulary';
import { t } from 'i18next';
import { VocabularyClockError } from '../utils/srs';
import { vocabularyQueue, type VocabularyJoined } from '../services/vocabulary/queue';
import {
  getVocabularySnapshot,
  introduceVocabularyCard,
  rateVocabularyCard,
  StaleVocabularyError,
  VocabularyQuotaError,
} from '../storage/vocabulary';
import { wordsInput } from '../services/today/inputs';
import type { VocabularyModel } from './useVocabulary';
export function useVocabularyReview(model: VocabularyModel, book?: VocabularyBook) {
  const [active, setActive] = useState<{
    candidate: VocabularyJoined;
    tokens: VocabularyTokens;
    row?: VocabularyRow;
  } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaReached, setQuotaReached] = useState(false);
  const [pending, setPending] = useState<{
    operationId: string;
    outcome: VocabularyOutcome;
    reviewedAt: number;
  } | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [ratings, setRatings] = useState(0);
  const [introductions, setIntroductions] = useState(0);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(true);
  const lock = useRef(false);
  const { refresh } = model;
  if (active && active.tokens.epoch !== model.epoch) {
    setActive(null);
    setRevealed(false);
    setPending(null);
    setError(null);
    setQuotaReached(false);
  }
  const queue = vocabularyQueue(
    model.rows,
    book,
    model.day,
    model.preferences.newPerDay,
    now,
    excluded,
    model.preferences.studyBook,
  );
  const counts = wordsInput(model.rows, book, model.day, model.preferences.newPerDay, now, model.preferences.studyBook);
  useEffect(() => {
    alive.current = true;
    const wake = () => {
      setNow(Date.now());
      void refresh();
    };
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [refresh]);
  const candidate = queue.candidates[0];
  useEffect(() => {
    if (active || !candidate || model.error || error) return;
    let live = true;
    void getVocabularySnapshot(candidate.key)
      .then((snapshot) => {
        if (live) setActive({ candidate, ...snapshot });
      })
      .catch((error: unknown) => {
        if (live) setError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      live = false;
    };
  }, [active, candidate, model.epoch, model.error, error]);
  const advance = () => {
    setActive(null);
    setRevealed(false);
    setPending(null);
    setError(null);
    setQuotaReached(false);
    setNow(Date.now());
  };
  const handleFailure = async (error: unknown) => {
    if (!alive.current) return;
    if (error instanceof StaleVocabularyError || error instanceof VocabularyQuotaError) {
      await model.refresh();
      if (alive.current) {
        advance();
        if (error instanceof VocabularyQuotaError) setQuotaReached(true);
      }
    } else if (error instanceof VocabularyClockError) {
      setPending(null);
      setError(t('vocab.clockError'));
    } else setError(error instanceof Error ? error.message : String(error));
  };
  const reveal = async () => {
    if (!active || revealed || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setQuotaReached(false);
    const epoch = active.tokens.epoch;
    try {
      const result = await introduceVocabularyCard(active.candidate, active.tokens, Date.now());
      if (alive.current && epoch === result.tokens.epoch) {
        setActive({ candidate: active.candidate, ...result });
        setRevealed(true);
        if (result.introduced) setIntroductions((n) => n + 1);
        return true;
      }
    } catch (error) {
      await handleFailure(error);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
    return false;
  };
  const recall = async (outcome: VocabularyOutcome) => {
    if (!active || !revealed || lock.current || (pending && pending.outcome !== outcome)) return;
    const operation = pending ?? { operationId: crypto.randomUUID(), outcome, reviewedAt: Date.now() };
    setPending(operation);
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await rateVocabularyCard(
        active.candidate.key,
        active.tokens,
        operation.operationId,
        operation.outcome,
        operation.reviewedAt,
      );
      if (alive.current) {
        setRatings((n) => n + 1);
        advance();
      }
    } catch (error) {
      await handleFailure(error);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const skip = () => {
    if (!active || lock.current || pending) return;
    setExcluded((keys) => new Set([...keys, active.candidate.key]));
    advance();
  };
  return {
    active,
    revealed,
    busy,
    error: error ?? model.error,
    quotaReached,
    pending: pending ? { outcome: pending.outcome } : null,
    ratings,
    introductions,
    now,
    nextDue: queue.nextDue,
    due: counts.due,
    remaining: counts.newAvailable,
    reveal,
    recall,
    skip,
    retry: () => {
      setError(null);
      void refresh();
    },
  };
}
