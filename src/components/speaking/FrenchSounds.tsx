import { useTranslation } from 'react-i18next';
import { FRENCH_IPA, type IpaGroup } from '../../data/frenchIpa';
import { toggleSpeech } from '../../utils/speech';
import { SpeakIcon, useSpeechPhase } from '../ui/speak-button';

const GROUPS: IpaGroup[] = ['vowels', 'nasals', 'semivowels', 'consonants'];

/** Playback changes the icon inside the fixed-size tile, not the reference layout. */
function IpaTile({ symbol, word, label }: { symbol: string; word: string; label: string }) {
  const phase = useSpeechPhase(word);
  return (
    <button
      type="button"
      onClick={() => toggleSpeech(word)}
      aria-label={label}
      className="group w-full h-16 rounded-md border border-ink-200 bg-surface hover:border-accent-300 hover:bg-accent-50 flex flex-col items-center justify-center cursor-pointer"
    >
      <span className="text-xl leading-none text-ink-900">[{symbol}]</span>
      <span className="mt-1.5 inline-flex items-center gap-1 font-serif text-sm text-ink-600">
        {word}
        <SpeakIcon phase={phase} className="w-3 h-3 text-ink-400 group-hover:text-accent-900" />
      </span>
    </button>
  );
}

export function FrenchSounds() {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 space-y-4 border-t border-ink-200 pt-6" aria-labelledby="french-sounds-title">
      <div>
        <h2 id="french-sounds-title" className="font-serif font-semibold text-lg text-ink-900">
          {t('ipa.title')}
        </h2>
        <p className="text-sm text-ink-500 mt-0.5">{t('ipa.subtitle')}</p>
      </div>
      {GROUPS.map((group) => (
        <div key={group} className="space-y-2">
          <h3 className="text-sm font-medium text-ink-700">{t(`ipa.${group}`)}</h3>
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {FRENCH_IPA[group].map((sound) => (
              <li key={sound.symbol}>
                <IpaTile
                  symbol={sound.symbol}
                  word={sound.word}
                  label={t('ipa.play', { word: sound.word, symbol: sound.symbol })}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
