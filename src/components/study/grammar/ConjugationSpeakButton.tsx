/** Key-free listening for conjugation forms and examples, using the shared control and device speech path. */
import { useTranslation } from 'react-i18next';
import { SpeakButton } from '../../ui/speak-button';

export function ConjugationSpeakButton({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <SpeakButton
      text={text}
      engine="device"
      label={t('conjugation.page.listen', { text })}
      stopLabel={t('conjugation.page.stopListening', { text })}
      variant="ghost"
      size="icon"
    />
  );
}
