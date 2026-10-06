import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { LANGUAGES, setAppLanguage } from '../i18n';
import { MenuButton } from './ui/menu-button';

/** One icon button; opens a short list of interface languages. */
export const LanguageSwitcher: React.FC = () => {
  const { t, i18n } = useTranslation();
  const current = i18n.language === 'zh' ? 'zh' : 'en';

  return (
    <MenuButton
      icon={<Languages className="w-5 h-5" />}
      label={t('nav.language')}
      items={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
      value={current}
      onSelect={(code) => setAppLanguage(code)}
    />
  );
};
