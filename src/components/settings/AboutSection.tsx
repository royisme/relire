import React from 'react';
import { useTranslation } from 'react-i18next';
import { contentServiceUrl } from '../../services/grammarTopics/service';
import { PageHeader } from '../ui/page-header';

const SOURCE_URL = 'https://github.com/royisme/relire';
// The lexicon's source as the content service names it (worker/src/index.ts, worker/NOTICE.md).
const LEXICON = {
  name: 'Morphalou 3.1',
  maintainer: 'ATILF (CNRS / Université de Lorraine)',
  licence: 'LGPL-LR',
  url: 'http://www.cnrtl.fr/lexiques/morphalou/',
};
const LINK = 'text-accent-900 underline underline-offset-2';

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
        {/* Morphalou data is only used when a content service is configured. */}
        {contentServiceUrl() && (
          <>
            <p>
              {t('settings.about.lexicon', LEXICON)}{' '}
              <a href={LEXICON.url} target="_blank" rel="noreferrer" className={LINK}>
                {t('settings.about.lexiconSource', LEXICON)}
              </a>
            </p>
            <p>
              {t('settings.about.lexiconRebuild')}{' '}
              <a href={`${SOURCE_URL}/blob/main/worker/NOTICE.md`} target="_blank" rel="noreferrer" className={LINK}>
                {t('settings.about.lexiconNotice')}
              </a>
            </p>
          </>
        )}
        <p>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={LINK}>
            {t('settings.about.source')}
          </a>
        </p>
      </div>
    </div>
  );
};
