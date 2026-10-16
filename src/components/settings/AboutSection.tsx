import React from 'react';
import { useTranslation } from 'react-i18next';

const SOURCE_URL = 'https://github.com/royisme/relire';

/** Settings → About: what Relire is, where the data goes, what it does not claim. */
export const AboutSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-700">
      <p>{t('settings.about.what')}</p>
      <p>{t('settings.about.privacy')}</p>
      <p>{t('settings.about.scope')}</p>
      <p>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="text-accent-900 underline underline-offset-2">
          {t('settings.about.source')}
        </a>
      </p>
    </div>
  );
};
