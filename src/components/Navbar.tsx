import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, BookmarkCheck, BookOpen, Dumbbell, Menu, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { Drawer, OverlayHeader } from './ui/overlay';
import { PWAInstallButton } from './PWAInstallButton';
import { LanguageSwitcher } from './LanguageSwitcher';

type Tab = 'reader' | 'vocab' | 'practice' | 'analytics';

interface NavbarProps {
  currentTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onOpenSettings: () => void;
  dueCount: number;
  totalVocabCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenSettings,
  dueCount,
}) => {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tabs = [
    { id: 'reader', icon: BookOpen, label: t('nav.reader') },
    { id: 'vocab', icon: BookmarkCheck, label: t('nav.vocab') },
    { id: 'practice', icon: Dumbbell, label: t('nav.practice') },
    { id: 'analytics', icon: BarChart3, label: t('nav.analytics') },
  ] as const;

  const dueBadge = (
    <span className="tnum min-w-5 px-1.5 rounded-full text-xs font-medium bg-accent-700 text-white text-center">
      {dueCount}
    </span>
  );

  const brand = (
    <button
      className="shrink-0 font-serif text-xl font-semibold italic text-ink-900 cursor-pointer"
      onClick={() => onSelectTab('reader')}
    >
      {t('common.appName')}
    </button>
  );

  return (
    <header className="sticky top-0 z-30 bg-ink-50 border-b border-ink-200">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 flex items-center gap-2 h-14">
        {/* Small screens: menu button opens the drawer */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden -ml-2"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('nav.menu')}
          aria-expanded={drawerOpen}
        >
          <Menu className="w-5 h-5" />
        </Button>

        {brand}

        {/* md and up: flat tabs */}
        <nav className="hidden md:flex items-stretch h-full ml-4" aria-label={t('nav.main')}>
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
                <span>{label}</span>
                {id === 'vocab' && dueCount > 0 && dueBadge}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent-700" />}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <div className="hidden md:flex items-center gap-1">
            <PWAInstallButton />
            <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label={t('nav.settings')} title={t('nav.settings')}>
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <Drawer onClose={() => setDrawerOpen(false)} label={t('nav.menu')}>
          <OverlayHeader
            title={t('common.appName')}
            onClose={() => setDrawerOpen(false)}
            closeLabel={t('common.close')}
          />
          <nav className="flex-1 overflow-y-auto py-2" aria-label={t('nav.main')}>
            {tabs.map(({ id, icon: Icon, label }) => {
              const active = currentTab === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    onSelectTab(id);
                    setDrawerOpen(false);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 px-4 h-12 text-sm cursor-pointer ${
                    active ? 'bg-accent-50 text-accent-900 font-medium' : 'text-ink-800 hover:bg-ink-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{label}</span>
                  {id === 'vocab' && dueCount > 0 && dueBadge}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-ink-200 py-2">
            <PWAInstallButton variant="row" onDone={() => setDrawerOpen(false)} />
            <button
              onClick={() => {
                setDrawerOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-3 px-4 h-12 text-sm text-ink-800 hover:bg-ink-100 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-ink-600" />
              <span>{t('nav.settings')}</span>
            </button>
          </div>
        </Drawer>
      )}
    </header>
  );
};
