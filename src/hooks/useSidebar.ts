/**
 * Whether the sidebar is expanded (icon + label) or an icon rail, from `lg` up.
 * The learner's choice is remembered in `relire_sidebar`. In the reader it always starts
 * collapsed so the article stays the page; opening it there lasts for that visit only and is
 * not remembered, so the reader never inherits a wide sidebar.
 */
import { useCallback, useState } from 'react';

const KEY = 'relire_sidebar';

function readPreference(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'collapsed';
  } catch {
    return true;
  }
}

export function useSidebar(inReader: boolean) {
  const [preferred, setPreferred] = useState(readPreference);
  const [readerOpen, setReaderOpen] = useState(false);

  // Each visit to the reader starts collapsed (adjusted while rendering, as the route changes).
  const [wasInReader, setWasInReader] = useState(inReader);
  if (wasInReader !== inReader) {
    setWasInReader(inReader);
    if (!inReader) setReaderOpen(false);
  }

  const expanded = inReader ? readerOpen : preferred;

  const toggle = useCallback(() => {
    if (inReader) {
      setReaderOpen((open) => !open);
      return;
    }
    const next = !preferred;
    setPreferred(next);
    try {
      localStorage.setItem(KEY, next ? 'expanded' : 'collapsed');
    } catch {
      // The choice still applies until the page closes.
    }
  }, [inReader, preferred]);

  return { expanded, toggle };
}
