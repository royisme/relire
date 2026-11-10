/**
 * Owns app startup: the one IndexedDB load, shared articles and stats, failed-save reports and the first-run guide flag.
 * Not vocabulary, lookups or routing.
 */
import { useEffect, useState } from 'react';
import type { Article, UserStats } from '../types';
import { SAMPLE_ARTICLES } from '../data/sampleArticles';
import { EMPTY_STATS, loadData, initializeData, saveStats } from '../storage/db';
import { usePersist } from '../storage/usePersist';
import { hasTextKey } from '../utils/appSettings';

const ONBOARDING_KEY = 'relire_onboarded';
const storedFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export function useAppData() {
  // Articles and vocabulary commit before state changes; only stats use debounced persistence.
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedSaves, setFailedSaves] = useState<string[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const reportSave = (name: string, error: unknown) => {
    if (error) console.error(`Saving ${name} failed`, error);
    setFailedSaves((prev) => (error ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)));
  };

  useEffect(() => {
    let cancelled = false;
    void initializeData(SAMPLE_ARTICLES)
      .then(() => loadData())
      .then((data) => {
        if (cancelled || !data) return;
        setArticles(data.articles);
        setStats(data.stats);
        setReady(true);
        // First visit with no key: walk the user through setup.
        if (!storedFlag(ONBOARDING_KEY) && !hasTextKey()) setOnboardingOpen(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  usePersist('stats', stats, saveStats, ready, reportSave);

  const finishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // Private mode: the guide will simply show again next time.
    }
    setOnboardingOpen(false);
  };

  return {
    ready,
    loadError,
    failedSaves,
    articles,
    setArticles,
    stats,
    setStats,
    reportSave,
    onboardingOpen,
    finishOnboarding,
  };
}
