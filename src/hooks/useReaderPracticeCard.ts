/** Owns reader practice-card state and Escape priority; rendering and sentence focus stay in the reader. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePracticeCard } from './usePracticeCard';
import { stopSpeech } from '../utils/speech';

export function useReaderPracticeCard(setIsSpeedControlOpen: (open: boolean) => void) {
  // Practising one sentence: recording happens in the docked card, never on the pill.
  const card = usePracticeCard();
  const cardBusy =
    card.phase === 'acquiring' || card.phase === 'recording' || card.phase === 'saving' || card.phase === 'unsaved';
  const cardRef = useRef(card);
  useLayoutEffect(() => {
    cardRef.current = card;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // One owner, outermost first: an open sheet handles its own Escape; then the card; then speech.
      if (document.querySelector('[aria-modal="true"]')) return;
      const practice = cardRef.current;
      if (practice.phase !== 'closed') {
        if (practice.phase !== 'unsaved') practice.close();
        return;
      }
      stopSpeech();
      setIsSpeedControlOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopSpeech();
    };
    // ReaderView passes its stable state setter; keep the original mount-only Escape lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { card, cardBusy, cardRef };
}
