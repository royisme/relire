/**
 * Local material ownership and one cancellable analysis run for an import page; the page supplies what the run
 * does with the text and images (extract exercises, or read an article). Never saves drafts or follows a
 * missing-key redirect.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openMaterial, parsePageSelection, type ImportMaterial } from '../services/importMaterial';
import { MissingApiKeyError } from '../services/api';
import { getAiAccess } from '../services/ai/access';
import type { AiAccess, ImageInput } from '../services/ai/types';
import type { ImportSource } from '../services/exercises/importDraft';

/** What a page's run gets: the pasted text, the rendered pages when a file was chosen, and the pinned access. */
export interface ImportRun {
  text: string;
  images?: ImageInput[];
  signal: AbortSignal;
  access: AiAccess;
}

/**
 * `pastedTextUsesAi` says whether pasted text goes to the text AI (exercise import) or is used as it is
 * (article import); it decides which selection the consent panel shows when no file is chosen.
 */
export function useImportSource<R>(run: (input: ImportRun) => Promise<R>, pastedTextUsesAi: boolean) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [material, setMaterial] = useState<ImportMaterial | null>(null);
  const [pages, setPages] = useState('1');
  const [phase, setPhase] = useState<'idle' | 'opening' | 'extracting'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ source: ImportSource; output: R } | null>(null);
  // Consent pins the settings including the key in memory, even if another tab changes settings while pages render.
  const [access] = useState(() => getAiAccess());
  const purpose: 'ocr' | 'text' = material || !pastedTextUsesAi ? 'ocr' : 'text';
  const model = access.selection(purpose);
  const lifetime = useRef<AbortController | null>(null);
  const request = useRef<AbortController | null>(null);
  const active = useRef<ImportMaterial | null>(null);
  const revision = useRef(0);
  function cancel() {
    revision.current++;
    request.current?.abort();
    request.current = null;
    setPhase('idle');
  }
  function dispose() {
    cancel();
    lifetime.current?.abort();
    void active.current?.dispose();
    active.current = null;
  }
  useEffect(
    () => () => {
      revision.current++;
      request.current?.abort();
      lifetime.current?.abort();
      void active.current?.dispose();
    },
    [],
  );
  async function choose(file: File) {
    dispose();
    setResult(null);
    setMaterial(null);
    setError('');
    setPhase('opening');
    const version = revision.current;
    const controller = new AbortController();
    lifetime.current = controller;
    request.current = controller;
    try {
      const opened = await openMaterial(file, controller.signal);
      if (version !== revision.current) {
        await opened.dispose();
        return;
      }
      active.current = opened;
      setMaterial(opened);
      setPages('1');
    } catch (err) {
      if (!controller.signal.aborted && version === revision.current)
        setError(String(err instanceof Error ? err.message : err));
    } finally {
      if (version === revision.current) {
        setPhase('idle');
        request.current = null;
      }
    }
  }
  function clearMaterial() {
    dispose();
    setMaterial(null);
    setResult(null);
    setError('');
  }
  let selectedPages: number[] = [];
  let pageError = '';
  if (material) {
    try {
      selectedPages = parsePageSelection(material.source.kind === 'pdf' ? pages : '1', material.pageCount);
    } catch (err) {
      pageError = err instanceof Error ? err.message : String(err);
    }
  }
  const unsupported = !!material && model.capabilities.imageInput === 'unsupported';
  async function analyze() {
    if (phase !== 'idle' || unsupported || pageError || (!material && !text.trim()) || text.length > 40000) return;
    cancel();
    setError('');
    setPhase('extracting');
    const version = revision.current;
    const controller = new AbortController();
    request.current = controller;
    const source: ImportSource = material
      ? { ...material.source, pages: selectedPages }
      : { kind: 'text', name: t('importFlow.pastedText'), pages: [] };
    try {
      const images = material ? await material.render(selectedPages, controller.signal) : undefined;
      controller.signal.throwIfAborted();
      const output = await run({ text, images, signal: controller.signal, access });
      if (version === revision.current && !controller.signal.aborted) setResult({ source, output });
    } catch (err) {
      if (version === revision.current && !controller.signal.aborted)
        setError(
          err instanceof MissingApiKeyError
            ? t('importFlow.missingKey')
            : t('importFlow.failed', { msg: err instanceof Error ? err.message : String(err) }),
        );
    } finally {
      if (version === revision.current) {
        setPhase('idle');
        request.current = null;
      }
    }
  }
  return {
    text,
    setText,
    material,
    pages,
    setPages,
    phase,
    error,
    result,
    choose,
    cancel,
    dispose,
    model,
    purpose,
    selectedPages,
    pageError,
    unsupported,
    analyze,
    /** Drops the chosen file and keeps the pasted text. */
    clearMaterial,
    reset: () => {
      clearMaterial();
      setText('');
    },
  };
}
