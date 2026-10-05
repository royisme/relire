import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, BookmarkCheck, Dumbbell, BarChart3, PlusCircle, Settings, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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

  return (
    <header className="sticky top-0 z-30 bg-[#FDFBF7]/95 border-b border-stone-200/90 shadow-2xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between min-h-[56px] py-1.5 gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
          
          {/* Left: Brand Identity (compact, zero wrap) */}
          <div
            className="flex items-center gap-2.5 cursor-pointer shrink-0 select-none py-1"
            onClick={() => onSelectTab('reader')}
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-stone-900 flex items-center justify-center text-white shadow-xs">
              <span className="font-french-serif text-xl sm:text-2xl font-bold italic tracking-tighter">É</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-french-serif font-bold text-lg sm:text-xl text-stone-900 tracking-tight whitespace-nowrap">
                  {t('common.appName')}
                </span>
                <Badge variant="emerald" className="hidden sm:inline-flex text-[10px] px-1.5 py-0.2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-0.5"></span>
                  {t('nav.geminiTts')}
                </Badge>
              </div>
            </div>
          </div>

          {/* Center: Unified shadcn Segmented Navigation Tabs (guaranteed single-line) */}
          <nav className="inline-flex items-center rounded-xl bg-stone-100/90 p-1 border border-stone-200/80 shadow-2xs shrink-0 select-none">
            <button
              onClick={() => onSelectTab('reader')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'reader'
                  ? 'bg-white text-stone-900 font-bold shadow-2xs ring-1 ring-stone-950/5'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t('nav.reader')}</span>
            </button>

            <button
              onClick={() => onSelectTab('vocab')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'vocab'
                  ? 'bg-white text-stone-900 font-bold shadow-2xs ring-1 ring-stone-950/5'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>{t('nav.vocab')}</span>
              {dueCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-700 text-white">
                  {dueCount}
                </span>
              ) : totalVocabCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-stone-200 text-stone-700">
                  {totalVocabCount}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => onSelectTab('practice')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'practice'
                  ? 'bg-white text-stone-900 font-bold shadow-2xs ring-1 ring-stone-950/5'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>{t('nav.practice')}</span>
            </button>

            <button
              onClick={() => onSelectTab('analytics')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'analytics'
                  ? 'bg-white text-stone-900 font-bold shadow-2xs ring-1 ring-stone-950/5'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{t('nav.analytics')}</span>
            </button>
          </nav>

          {/* Right: Unified Action Controls (shadcn Button style, compact & clean) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Import Button */}
            <Button
              onClick={onOpenImporter}
              variant="default"
              size="sm"
              className="font-medium whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">{t('nav.importArticle')}</span>
              <span className="md:hidden">{t('nav.importShort')}</span>
            </Button>

            {/* PWA Install on Mac Button */}
            <PWAInstallButton />

            {/* Language Switcher (EN / 中文) */}
            <LanguageSwitcher />

            {/* Settings Button */}
            <Button
              onClick={onOpenSettings}
              variant="outline"
              size="iconSm"
              className="text-stone-600 hover:text-stone-900 shrink-0"
              title={t('nav.settings')}
            >
              <Settings className="w-3.5 h-3.5 text-stone-700" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
