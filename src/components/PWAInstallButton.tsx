import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, OverlayHeader } from './ui/overlay';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button } from './ui/button';

/** Install control: draws nothing itself, so the sidebar and the drawer can style it as a row. */
export const PWAInstallButton: React.FC<{
  onDone?: () => void;
  children: (control: { label: string; onClick: () => void }) => React.ReactNode;
}> = ({ onDone, children }) => {
  const { t } = useTranslation();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showMacGuide, setShowMacGuide] = useState(false);

  // Already running as an installed app: nothing to offer.
  if (isInstalled) return null;

  const label = t('nav.installApp');
  const onClick = () => {
    if (isInstallable) {
      void install();
      onDone?.();
    } else {
      setShowMacGuide(true);
    }
  };

  return (
    <>
      {children({ label, onClick })}

      {showMacGuide && (
        <Dialog onClose={() => setShowMacGuide(false)} label={t('pwa.title')} className="max-w-md">
          <OverlayHeader title={t('pwa.title')} onClose={() => setShowMacGuide(false)} closeLabel={t('common.close')} />
          <div className="p-5 space-y-4">
            <div className="space-y-3 text-xs text-ink-700 leading-relaxed font-sans">
              <div className="p-3 rounded-lg bg-surface border border-ink-200 space-y-1.5">
                <span className="font-semibold text-ink-900 block">{t('pwa.chromeWay')}</span>
                <p>{t('pwa.chromeDesc')}</p>
              </div>

              <div className="p-3 rounded-lg bg-surface border border-ink-200 space-y-1.5">
                <span className="font-semibold text-ink-900 block">{t('pwa.safariWay')}</span>
                <p>{t('pwa.safariDesc')}</p>
              </div>

              <div className="p-3 rounded-lg bg-ink-50 border border-ink-200 text-ink-800 text-xs space-y-1">
                <strong>{t('pwa.noServerWhy')}</strong>
                <p>{t('pwa.noServerDesc')}</p>
              </div>
            </div>

            <Button onClick={() => setShowMacGuide(false)} variant="default" className="w-full cursor-pointer">
              {t('pwa.gotIt')}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
};
