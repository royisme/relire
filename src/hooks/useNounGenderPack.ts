/** Owns mount-scoped noun-pack readiness; loading policy and validation belong to the lazy loader. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadedNounGenderPack, loadNounGenderPack } from '../services/nounGender/load';
import type { NounGenderPack } from '../types/nounGender';

type State = { status: 'loading' } | { status: 'ready'; pack: NounGenderPack } | { status: 'error'; error: string };

export function useNounGenderPack(): State {
  const [state, setState] = useState<State>(() => {
    const pack = loadedNounGenderPack();
    return pack ? { status: 'ready', pack } : { status: 'loading' };
  });
  useEffect(() => {
    let live = true;
    void loadNounGenderPack().then(
      (pack) => {
        if (live) setState({ status: 'ready', pack });
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
