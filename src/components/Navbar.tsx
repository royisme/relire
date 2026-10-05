import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, BookmarkCheck, Dumbbell, BarChart3, PlusCircle, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { PWAInstallButton } from './PWAInstallButton';
import { LanguageSwitcher } from './LanguageSwitcher';

interface NavbarProps {
  currentTab: 'reader' | 'vocab' | 'practice' | 'analytics';
  onSelectTab: (tab: 'reader' | 'vocab' | 'practice' | 'analytics') => void;
  onOpenImporter: () => void;
  onOpenSettings: () => void;
  dueCount: number;
  totalVocabCount: number;
  selectedVoice: 'Kore' | 'Charon';
  onSelectVoice: (voice: 'Kore' | 'Charon') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenImporter,
  onOpenSettings,
  dueCount,
  totalVocabCount,
}) => {
  const { t } = useTranslation();

  const tabs = [
    { id: 'reader', icon: BookOpen, label: t('nav.reader') },
    { id: 'vocab', icon: BookmarkCheck, label: t('nav.vocab') },
    { id: 'practice', icon: Dumbbell, label: t('nav.practice') },
    { id: 'analytics', icon: BarChart3, label: t('nav.analytics') },
  ] as const;

  return (
    <header className="sticky top-0 z-30 bg-ink-50 border-b border-ink-200">
      <div className="max-w-5xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between gap-3 h-14">
          <button
            className="shrink-0 flex items-baseline gap-2 select-none cursor-pointer"
            onClick={() => onSelectTab('reader')}
            aria-label={t('common.appName')}
          >
            <span className="font-serif text-lg sm:text-xl font-semibold italic text-ink-900 whitespace-nowrap">
              <span className="hidden min-[420px]:inline">{t('common.appName')}</span><span className="min-[420px]:hidden">É</span>
            </span>
          </button>

          <nav className="flex items-stretch h-full overflow-x-auto no-scrollbar" aria-label="Main">
            {tabs.map(({ id, icon: Icon, label }) => {
              const active = currentTab === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative inline-flex items-center gap-1.5 px-3 text-sm whitespace-nowrap cursor-pointer ${
                    active ? 'text-ink-900 font-medium' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                  {id === 'vocab' && dueCount > 0 && (
                    <span className="tnum min-w-5 px-1.5 rounded-full text-xs font-medium bg-accent-700 text-white text-center">
                      {dueCount}
                    </span>
                  )}
                  {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent-700" />}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button onClick={onOpenImporter} size="sm" className="whitespace-nowrap">
              <PlusCircle className="w-4 h-4" />
              <span className="hidden md:inline">{t('nav.importArticle')}</span>
              <span className="sr-only md:hidden">{t('nav.importShort')}</span>
            </Button>
            <div className="hidden md:block"><PWAInstallButton /></div>
            <LanguageSwitcher />
            <Button onClick={onOpenSettings} variant="outline" size="icon" title={t('nav.settings')} aria-label={t('nav.settings')}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
