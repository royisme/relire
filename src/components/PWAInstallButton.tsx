import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, OverlayHeader } from './ui/overlay';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button } from './ui/button';

export const PWAInstallButton: React.FC<{ variant?: 'icon' | 'row'; onDone?: () => void }> = ({
  variant = 'icon',
  onDone,
}) => {
  const { t } = useTranslation();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showMacGuide, setShowMacGuide] = useState(false);

  // Already running as an installed app: nothing to offer.
  if (isInstalled) return null;

  const label = t('nav.installApp');
  const onClick = () => {
    if (isInstallable) {
      install();
      onDone?.();
    } else {
      setShowMacGuide(true);
    }
  };

  return (
    <>
      {variant === 'row' ? (
        <button
          onClick={onClick}
          className="flex w-full items-center gap-3 px-4 h-12 text-sm text-ink-800 hover:bg-ink-100 cursor-pointer"
        >
          <Download className="w-4 h-4 text-ink-600" />
          <span>{label}</span>
        </button>
      ) : (
        <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label}>
          <Download className="w-5 h-5" />
        </Button>
      )}

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
