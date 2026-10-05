import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, OverlayHeader } from './ui/overlay';
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
      <Badge variant="ok" className="hidden lg:inline-flex">
        <CheckCircle2 className="w-3.5 h-3.5 mr-0.5 text-ok-600" />
        <span>{t('nav.installedDesktop')}</span>
      </Badge>
    );
  }

  // 1-Click Install Flow (Chrome / Edge / Chromium on Mac/Windows)
  if (isInstallable) {
    return (
      <Button
        onClick={install}
        variant="outline"
        size="sm"
        className="font-medium whitespace-nowrap cursor-pointer"
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
        className="text-ink-700 whitespace-nowrap cursor-pointer"
        title={t('nav.installMac')}
      >
        <Laptop className="w-3.5 h-3.5 text-ink-600" />
        <span className="hidden lg:inline">{t('nav.installMac')}</span>
        <span className="lg:hidden">{t('nav.installApp')}</span>
      </Button>

      {showMacGuide && (
        <Dialog onClose={() => setShowMacGuide(false)} label={t('pwa.title')} className="max-w-md">
          <OverlayHeader title={t('pwa.title')} onClose={() => setShowMacGuide(false)} closeLabel={t('common.close')} />
          <div className="p-5 space-y-4">

            <div className="space-y-3 text-xs text-ink-700 leading-relaxed font-sans">
              <div className="p-3 rounded-lg bg-white border border-ink-200 space-y-1.5">
                <span className="font-semibold text-ink-900 block">
                  {t('pwa.chromeWay')}
                </span>
                <p>
                  {t('pwa.chromeDesc')}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-white border border-ink-200 space-y-1.5">
                <span className="font-semibold text-ink-900 block">
                  {t('pwa.safariWay')}
                </span>
                <p>
                  {t('pwa.safariDesc')}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-ok-50 border border-ok-200 text-ok-950 text-xs space-y-1">
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
        </Dialog>
      )}
    </>
  );
};
