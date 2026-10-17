/** Page-local discovery for the current provider/key. Nothing is persisted or treated as verification. */
import { useEffect, useRef, useState } from 'react';
import { getAiAccess } from '../../services/ai/access';
import { errorMessage } from '../../services/ai/errors';
import type { AiPurpose, ModelInfo } from '../../services/ai/types';
import { getApiKey, type AppSettings } from '../../utils/appSettings';

type CatalogueState = {
  provider: string;
  key: string;
  models?: ModelInfo[];
  loading: boolean;
  error?: string;
};
export function useModelCatalogue(draft: AppSettings, purpose: AiPurpose) {
  const provider = draft[`${purpose}Provider`];
  const key = getApiKey(draft, provider);
  const [state, setState] = useState<CatalogueState | null>(null);
  const request = useRef<AbortController | null>(null);
  const token = useRef(0);
  useEffect(() => {
    // A changed provider or key, or leaving the page, cancels the request and ignores its result.
    const version = token;
    const running = request;
    return () => {
      version.current++;
      running.current?.abort();
    };
  }, [provider, key]);
  const current = state?.provider === provider && state.key === key ? state : null;
  async function fetchModels() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const version = ++token.current;
    setState({ provider, key, models: current?.models, loading: true });
    try {
      const models = await getAiAccess(draft).listModels(purpose, controller.signal);
      if (version === token.current && !controller.signal.aborted) setState({ provider, key, models, loading: false });
    } catch (err) {
      if (version === token.current && !controller.signal.aborted)
        setState({ provider, key, models: current?.models, loading: false, error: errorMessage(err, key) });
    }
  }
  return { models: current?.models, loading: current?.loading ?? false, error: current?.error, fetchModels };
}
