import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { setAppLanguage, getAppLanguage } from '../i18n';
import { Button } from './ui/button';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { i18n } = useTranslation();
  const currentLang = i18n.language === 'zh' ? 'zh' : 'en';

  const toggleLang = () => {
    const nextLang = currentLang === 'en' ? 'zh' : 'en';
    setAppLanguage(nextLang);
  };

  if (compact) {
    return (
      <Button
        onClick={toggleLang}
        variant="ghost"
        size="iconSm"
        className="text-stone-600 hover:text-stone-900 font-semibold text-xs"
        title={currentLang === 'en' ? 'Switch to 简体中文' : 'Switch to English'}
      >
        <span className="font-mono text-[11px] font-bold">
          {currentLang === 'en' ? '中' : 'EN'}
        </span>
      </Button>
    );
  }

  return (
    <Button
      onClick={toggleLang}
      variant="outline"
      size="sm"
      className="gap-1.5 font-medium text-xs whitespace-nowrap text-stone-700 hover:text-stone-950"
      title={currentLang === 'en' ? 'Switch to 简体中文' : 'Switch to English'}
    >
      <Globe className="w-3.5 h-3.5 text-amber-700" />
      <span className="font-semibold">{currentLang === 'en' ? 'EN' : '中'}</span>
    </Button>
  );
};
