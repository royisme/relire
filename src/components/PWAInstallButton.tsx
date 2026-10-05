import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Monitor, CheckCircle2, X, Laptop } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export const PWAInstallButton: React.FC = () => {
  const { t } = useTranslation();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showMacGuide, setShowMacGuide] = useState(false);

  // If already running in standalone PWA window, don't show the prompt
  if (isInstalled) {
    return (
      <Badge variant="emerald" className="hidden lg:inline-flex text-[11px] px-2 py-1">
        <CheckCircle2 className="w-3.5 h-3.5 mr-0.5 text-emerald-600" />
        <span>{t('nav.installedDesktop')}</span>
      </Badge>
    );
  }

  // 1-Click Install Flow (Chrome / Edge / Chromium on Mac/Windows)
  if (isInstallable) {
    return (
      <Button
        onClick={install}
        variant="amber"
        size="sm"
        className="font-medium whitespace-nowrap shadow-2xs cursor-pointer"
        title={t('nav.installMac')}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">{t('nav.installMac')} (PWA)</span>
        <span className="lg:hidden">{t('nav.installApp')}</span>
      </Button>
    );
  }

  // Fallback / Safari on Mac or manual install guide
  return (
    <>
      <Button
        onClick={() => setShowMacGuide(true)}
        variant="outline"
        size="sm"
        className="text-stone-700 whitespace-nowrap cursor-pointer"
        title={t('nav.installMac')}
      >
        <Laptop className="w-3.5 h-3.5 text-amber-700" />
        <span className="hidden lg:inline">{t('nav.installMac')}</span>
        <span className="lg:hidden">{t('nav.installApp')}</span>
      </Button>

      {showMacGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF8F5] border border-amber-900/20 w-full max-w-md rounded-xl p-6 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-700 text-white flex items-center justify-center">
                  <Monitor className="w-4 h-4" />
                </div>
                <h3 className="font-french-serif text-base font-bold text-stone-900">
                  {t('pwa.title')}
                </h3>
              </div>
              <button
                onClick={() => setShowMacGuide(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-700 leading-relaxed font-french-sans">
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <span className="font-bold text-stone-900 block">
                  {t('pwa.chromeWay')}
                </span>
                <p>
                  {t('pwa.chromeDesc')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <span className="font-bold text-stone-900 block">
                  {t('pwa.safariWay')}
                </span>
                <p>
                  {t('pwa.safariDesc')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-[11px] space-y-1">
                <strong>{t('pwa.noServerWhy')}</strong>
                <p>
                  {t('pwa.noServerDesc')}
                </p>
              </div>
            </div>

            <Button
              onClick={() => setShowMacGuide(false)}
              variant="default"
              className="w-full cursor-pointer"
            >
              {t('pwa.gotIt')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
