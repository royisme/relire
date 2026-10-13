/** Whether the primary input is a finger (no hover, coarse pointer): touch layouts dock controls instead of floating them. */
import { useSyncExternalStore } from 'react';

const QUERY = '(hover: none) and (pointer: coarse)';

function subscribe(listener: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

export const useTouchLayout = () => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
