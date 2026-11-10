/** Owns a spelling lookup with device-voice examples and optional IPA; speech state stays in SpeakButton. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpellingSoundsPack } from '../../types/spellingSounds';
import { buttonVariants } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { OverlayHeader, Sheet } from '../ui/overlay';
import { SpeakButton } from '../ui/speak-button';

export function LetterSoundSheet({
  pattern,
  onClose,
}: {
  pattern: SpellingSoundsPack['patterns'][number];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [ipaOpen, setIpaOpen] = useState(false);
  return (
    <Sheet label={pattern.spelling} onClose={onClose}>
      <OverlayHeader title={pattern.spelling} onClose={onClose} closeLabel={t('spellingSounds.sheetClose')} />
      <div className="min-h-0 overflow-y-auto space-y-6 p-5">
        <p className="text-sm text-ink-700">{t(`spellingSounds.notes.${pattern.id}`)}</p>
        <section className="space-y-2" aria-labelledby="letter-sound-examples-title">
          <h4 id="letter-sound-examples-title" className="font-serif text-lg font-semibold text-ink-900">
            {t('spellingSounds.examples')}
          </h4>
          <ul className="divide-y divide-ink-200">
            {pattern.examples.map((word) => (
              <li key={word} className="flex min-w-0 items-center justify-between gap-3 py-2">
                <span lang="fr" className="min-w-0 break-words font-serif text-xl text-ink-900">
                  {word}
                </span>
                <SpeakButton
                  text={word}
                  engine="device"
                  variant="ghost"
                  size="icon"
                  label={t('spellingSounds.listenWord', { word })}
                  stopLabel={t('player.stop')}
                />
              </li>
            ))}
          </ul>
        </section>
        {pattern.sound.length > 0 && (
          <Collapsible open={ipaOpen} onOpenChange={setIpaOpen} className="border-t border-ink-200 pt-3">
            <CollapsibleTrigger className={buttonVariants({ variant: 'ghost' })}>
              {t(ipaOpen ? 'spellingSounds.hideIpa' : 'spellingSounds.showIpa')}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="pt-3 font-mono text-xl leading-none text-ink-900">
                {pattern.sound.map((symbol) => `[${symbol}]`).join(' ')}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </Sheet>
  );
}
