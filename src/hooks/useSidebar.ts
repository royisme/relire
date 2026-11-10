/**
 * Whether the sidebar is expanded (icon + label) or an icon rail, from `lg` up.
 * The learner's choice is remembered in `relire_sidebar`. In a reader or exercise sheet it starts
 * collapsed so the content stays the page; opening it there lasts for that visit only and is
 * not remembered, so sheets never inherit a wide sidebar.
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

export function useSidebar(inSheet: boolean) {
  const [preferred, setPreferred] = useState(readPreference);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Each visit to a sheet starts collapsed (adjusted while rendering, as the route changes).
  const [wasInSheet, setWasInSheet] = useState(inSheet);
  if (wasInSheet !== inSheet) {
    setWasInSheet(inSheet);
    if (!inSheet) setSheetOpen(false);
  }

  const expanded = inSheet ? sheetOpen : preferred;

  const toggle = useCallback(() => {
    if (inSheet) {
      setSheetOpen((open) => !open);
      return;
    }
    const next = !preferred;
    setPreferred(next);
    try {
      localStorage.setItem(KEY, next ? 'expanded' : 'collapsed');
    } catch {
      // The choice still applies until the page closes.
    }
  }, [inSheet, preferred]);

  return { expanded, toggle };
}
