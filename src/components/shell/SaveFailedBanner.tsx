/** Owns the banner shown while a background save is failing, with the way to the backup page. Not deciding when saves fail. */
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';

export function SaveFailedBanner() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="bg-bad-50 border-b border-bad-200 text-bad-900 text-sm">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{t('storage.saveFailed')}</span>
        <button
          className="underline underline-offset-2 cursor-pointer"
          onClick={() => navigate({ name: 'settings', section: 'data' })}
        >
          {t('storage.openBackup')}
        </button>
      </div>
    </div>
  );
}
