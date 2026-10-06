import { useSyncExternalStore } from 'react';
import { getThemePreference, resolveTheme, setThemePreference, subscribeTheme, type ThemePreference } from './theme';

/** The theme preference and what it resolves to right now, for theme pickers. */
export function useTheme() {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference);
  return { preference, resolved: resolveTheme(preference), setPreference: setThemePreference as (p: ThemePreference) => void };
}
