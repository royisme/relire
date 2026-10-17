import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../ui/page-header';

const SOURCE_URL = 'https://github.com/royisme/relire';

/** Standalone About page: what Relire is, where the data goes, what it does not claim. */
export const AboutSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <PageHeader title={t('settings.about.title')} subtitle={t('settings.about.desc')} />
      <div className="space-y-4 text-sm leading-relaxed text-ink-700">
        <p>{t('settings.about.what')}</p>
        <p>{t('settings.about.privacy')}</p>
        <p>{t('settings.about.scope')}</p>
        <p>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent-900 underline underline-offset-2"
          >
            {t('settings.about.source')}
          </a>
        </p>
      </div>
    </div>
  );
};
