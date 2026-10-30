/** Grammar → Sentence workshop: the brick game, or an honest empty state while no AI source is wired. */
import { useTranslation } from 'react-i18next';
import { devSource } from '../../../services/atelier/devSource';
import { AtelierScreen } from '../../atelier/AtelierScreen';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';

// The fixture is development-only; a production build has no source until the AI calls are wired.
const source = import.meta.env.DEV ? devSource : null;

export default function AtelierPage({ onMissingKey }: { onMissingKey: () => void }) {
  const { t } = useTranslation();
  // The game is a full-bleed stage over the whole app, so it brings no page heading of its own.
  if (source) return <AtelierScreen source={source} />;
  return (
    <div className="space-y-5">
      <PageHeader title={t('atelier.title')} subtitle={t('atelier.subtitle')} />
      <div className="space-y-3">
        <p className="font-serif text-lg font-semibold text-ink-900">{t('atelier.needsKey')}</p>
        <p className="max-w-prose break-words text-sm text-ink-600">{t('atelier.needsKeyBody')}</p>
        <Button variant="outline" onClick={onMissingKey}>
          {t('atelier.addKey')}
        </Button>
      </div>
    </div>
  );
}
