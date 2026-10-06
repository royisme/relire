import React from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme';
import { useTheme } from '../theme/useTheme';
import { MenuButton } from './ui/menu-button';
import { ThemeSwatch } from './ui/theme-swatch';

/** One icon button in the header; opens the theme list (follow the system, light, sepia, dark). */
export const ThemeSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const { preference, resolved, setPreference } = useTheme();
  const Icon = preference === 'system' ? SunMoon : resolved === 'dark' ? Moon : Sun;

  return (
    <MenuButton<ThemePreference>
      icon={<Icon className="w-5 h-5" />}
      label={t('theme.label')}
      items={THEME_PREFERENCES.map((p) => ({ value: p, label: t(`theme.${p}`), leading: <ThemeSwatch theme={p} /> }))}
      value={preference}
      onSelect={setPreference}
    />
  );
};
