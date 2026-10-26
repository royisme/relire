/** Grammar's noun-gender reference: reviewed examples and the sample's real exceptions, with local drill creation. */
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNounGenderPack } from '../../../hooks/useNounGenderPack';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { GenderDrillForm } from './GenderDrillForm';
import { GenderGame } from './GenderGame';

export default function GenderPage() {
  const { t } = useTranslation();
  const state = useNounGenderPack();
  const [playing, setPlaying] = useState(false);
  // Back from a round unmounts the game's focused control, so the opener takes the focus back once it is rendered again.
  const playButton = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  useLayoutEffect(() => {
    if (!returning.current) return;
    returning.current = false;
    playButton.current?.focus({ preventScroll: true });
  }, [playing]);
  const pack = state.status === 'ready' ? state.pack : undefined;
  const nouns = new Map(pack?.nouns.map((noun) => [noun.id, noun.lemma]));
  const lemmas = (ids: string[]) => ids.map((id) => nouns.get(id)!).join(t('common.listSeparator'));
  return (
    <div className="space-y-5">
      <PageHeader title={t('nounGender.title')} subtitle={t('nounGender.subtitle')} />
      <div className={pack ? 'min-h-96' : 'h-96 overflow-y-auto'} aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <p className="text-sm text-ink-500">{t('nounGender.loading')}</p>}
        {state.status === 'error' && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {state.error}
          </p>
        )}
        {pack &&
          (playing ? (
            <GenderGame
              pack={pack}
              onBack={() => {
                returning.current = true;
                setPlaying(false);
              }}
            />
          ) : (
            <div className="space-y-6">
              <div>
                <Button ref={playButton} variant="outline" onClick={() => setPlaying(true)}>
                  {t('nounGender.game.play')}
                </Button>
              </div>
              <GenderDrillForm pack={pack} />
              {(['f', 'm'] as const).map((gender) => (
                <section key={gender} aria-labelledby={`gender-${gender}`}>
                  <h3 id={`gender-${gender}`} className="font-serif text-xl font-semibold text-ink-900">
                    {t(`nounGender.groups.${gender}`)}
                  </h3>
                  <dl className="mt-3 divide-y divide-ink-200 border-y border-ink-200">
                    {pack.rules
                      .filter((rule) => rule.gender === gender)
                      .map((rule) => (
                        <div key={rule.id} className="space-y-2 py-4" data-rule={rule.id}>
                          <dt className="break-words font-serif text-lg font-semibold text-ink-900">
                            {t(`nounGender.rules.${rule.id}`)}
                          </dt>
                          <dd className="space-y-1">
                            <p className="break-words text-sm text-ink-600">
                              {t('nounGender.examples')}{' '}
                              <span lang="fr" className="font-serif text-base text-ink-900">
                                {lemmas(rule.examples)}
                              </span>
                            </p>
                            {rule.exceptions.length > 0 && (
                              <p className="break-words text-sm text-ink-600">
                                {t('nounGender.exceptions')}{' '}
                                <span lang="fr" className="font-serif text-base text-ink-900">
                                  {lemmas(rule.exceptions)}
                                </span>
                              </p>
                            )}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
