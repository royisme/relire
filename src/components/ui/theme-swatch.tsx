import React from 'react';
import { Monitor } from 'lucide-react';
import type { ThemePreference } from '../../theme/theme';

/**
 * A theme's paper with a dot of its ink. Fixed colours on purpose: a swatch shows what a theme
 * looks like whichever theme is active. "system" has no colours of its own, so it is an icon.
 */
const PAPER = { light: '#FFFFFF', sepia: '#FBF6EA', dark: '#1E1C19' };
const INK = { light: '#1E1C1A', sepia: '#2B241A', dark: '#E7E2D9' };

export const ThemeSwatch: React.FC<{ theme: ThemePreference }> = ({ theme }) => {
  if (theme === 'system') return <Monitor className="w-4 h-4 shrink-0 text-ink-600" aria-hidden="true" />;
  return (
    <span
      aria-hidden="true"
      className="inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full border border-ink-300"
      style={{ background: PAPER[theme] }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: INK[theme] }} />
    </span>
  );
};
