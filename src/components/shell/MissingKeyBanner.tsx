/** Owns the banner that asks for an AI key and its action. Not deciding where it shows or how the key is requested. */
import { useTranslation } from 'react-i18next';

export function MissingKeyBanner({ onRequestKey }: { onRequestKey: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="bg-accent-50 border-b border-accent-200 text-accent-900 text-sm">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{t('keyBanner.text')}</span>
        <button className="font-medium underline underline-offset-2 cursor-pointer" onClick={onRequestKey}>
          {t('keyBanner.action')}
        </button>
      </div>
    </div>
  );
}
