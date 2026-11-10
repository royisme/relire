/** Owns the spelling-first reference and selected sheet; pack loading and playback live elsewhere. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpellingSounds } from '../../hooks/useSpellingSounds';
import type { SpellingSoundsPack } from '../../types/spellingSounds';
import { Button } from '../ui/button';
import { LetterSoundSheet } from './LetterSoundSheet';
import { PractiseLetterSounds } from './PractiseLetterSounds';

const GROUPS = ['vowels', 'nasals', 'consonants', 'silent'] as const;

export function LetterSounds() {
  const { t } = useTranslation();
  const { status, pack, error, retry } = useSpellingSounds();
  const [selected, setSelected] = useState<SpellingSoundsPack['patterns'][number] | null>(null);
  return (
    <section className="min-w-0 space-y-4 border-t border-ink-200 pt-6" aria-labelledby="letter-sounds-title">
      <div>
        <h2 id="letter-sounds-title" className="font-serif font-semibold text-lg text-ink-900">
          {t('spellingSounds.title')}
        </h2>
        <p className="text-sm text-ink-500 mt-0.5">{t('spellingSounds.intro')}</p>
      </div>
      {status === 'loading' && (
        <div role="status" className="min-h-[34rem] text-sm text-ink-600">
          {t('common.loading')}
        </div>
      )}
      {status === 'error' && (
        <div className="min-h-[34rem] space-y-3">
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
          <Button variant="outline" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      {status === 'ready' && pack && (
        <div className="min-h-[34rem] space-y-4">
          {pack.patterns.some((pattern) => pattern.review.kind === 'ai') && (
            <p className="text-xs text-ink-500">{t('spellingSounds.reviewNotice')}</p>
          )}
          <PractiseLetterSounds pack={pack} />
          {GROUPS.map((group) => (
            <div key={group} className="space-y-2">
              <h3 className="text-sm font-medium text-ink-700">{t(`spellingSounds.groups.${group}`)}</h3>
              <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {pack.patterns
                  .filter((pattern) => pattern.group === group)
                  .map((pattern) => (
                    <li key={pattern.id}>
                      <Button
                        variant="outline"
                        className="w-full min-h-11 h-auto break-words whitespace-normal font-serif text-xl"
                        onClick={() => setSelected(pattern)}
                      >
                        {pattern.spelling}
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {selected && <LetterSoundSheet key={selected.id} pattern={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
