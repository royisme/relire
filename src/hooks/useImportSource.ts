/** Local ordered material ownership and one cancellable import run; owns no review draft, storage or navigation. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  openMaterial,
  parsePageSelection,
  validateMaterialAddition,
  validateMaterialFile,
  type ImportMaterial,
} from '../services/importMaterial';
import { MissingApiKeyError } from '../services/api';
import { getAiAccess } from '../services/ai/access';
import type { AiAccess, ImageInput } from '../services/ai/types';
import type { ImportSource } from '../services/exercises/importDraft';

/** What a page's run gets: the pasted text, rendered pages in reading order, and the pinned access. */
export interface ImportRun {
  text: string;
  images?: ImageInput[];
  signal: AbortSignal;
  access: AiAccess;
}

/** Article text stays local; exercise text uses the text AI when no images are held. */
export function useImportSource<R>(run: (input: ImportRun) => Promise<R>, pastedTextUsesAi: boolean) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [materials, setMaterials] = useState<ImportMaterial[]>([]);
  const [pages, setPages] = useState('1');
  const [phase, setPhase] = useState<'idle' | 'opening' | 'extracting'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ source: ImportSource; output: R } | null>(null);
  // Consent pins the settings including the key in memory, even if another tab changes settings while pages render.
  const [access] = useState(() => getAiAccess());
  const hasMaterial = materials.length > 0;
  const pdf = materials[0]?.source.kind === 'pdf' ? materials[0] : null;
  const purpose: 'ocr' | 'text' = hasMaterial || !pastedTextUsesAi ? 'ocr' : 'text';
  const model = access.selection(purpose);
  const request = useRef<AbortController | null>(null);
  const active = useRef<ImportMaterial[]>([]);
  const revision = useRef(0);
  function cancel() {
    revision.current++;
    request.current?.abort();
    request.current = null;
    setPhase('idle');
  }
  function dispose() {
    cancel();
    for (const material of active.current) void material.dispose();
    active.current = [];
  }
  useEffect(
    () => () => {
      revision.current++;
      request.current?.abort();
      for (const material of active.current) void material.dispose();
    },
    [],
  );
  async function choose(files: readonly File[]) {
    if (request.current || !files.length) return;
    cancel();
    setResult(null);
    setError('');
    setPhase('opening');
    const version = revision.current;
    const failures: string[] = [];
    for (const file of files) {
      // Each opening owns its signal: cancelling a later opening must not close already-added images.
      const controller = new AbortController();
      request.current = controller;
      try {
        validateMaterialAddition(validateMaterialFile(file), active.current);
        const opened = await openMaterial(file, controller.signal);
        if (version !== revision.current) {
          await opened.dispose();
          return;
        }
        active.current = [...active.current, opened];
        setMaterials(active.current);
        if (opened.source.kind === 'pdf') setPages('1');
      } catch (err) {
        if (controller.signal.aborted || version !== revision.current) return;
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (version === revision.current) {
      setError([...new Set(failures)].join('\n'));
      setPhase('idle');
      request.current = null;
    }
  }
  function removeMaterial(material: ImportMaterial) {
    cancel();
    void material.dispose();
    active.current = active.current.filter((held) => held !== material);
    setMaterials(active.current);
    setResult(null);
    setPages('1');
    setError('');
  }
  function clearMaterial() {
    dispose();
    setMaterials([]);
    setResult(null);
    setPages('1');
    setError('');
  }
  let selectedPages: number[] = [];
  let pageError = '';
  if (hasMaterial) {
    try {
      selectedPages = pdf ? parsePageSelection(pages, pdf.pageCount) : materials.map((_, index) => index + 1);
    } catch (err) {
      pageError = err instanceof Error ? err.message : String(err);
    }
  }
  const unsupported = hasMaterial && model.capabilities.imageInput === 'unsupported';
  async function analyze() {
    if (request.current || unsupported || pageError || (!hasMaterial && !text.trim()) || text.length > 40000) return;
    cancel();
    setError('');
    setPhase('extracting');
    const version = revision.current;
    const controller = new AbortController();
    request.current = controller;
    const source: ImportSource = hasMaterial
      ? {
          kind: pdf ? 'pdf' : 'image',
          name: materials.map((material) => material.source.name).join(', '),
          pages: selectedPages,
        }
      : { kind: 'text', name: t('importFlow.pastedText'), pages: [] };
    try {
      const images: ImageInput[] = [];
      for (const material of materials) {
        images.push(...(await material.render(pdf ? selectedPages : [1], controller.signal)));
        controller.signal.throwIfAborted();
      }
      const output = await run({ text, images: hasMaterial ? images : undefined, signal: controller.signal, access });
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
    materials,
    hasMaterial,
    pdf,
    pages,
    setPages,
    phase,
    error,
    setError,
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
    removeMaterial,
    /** Drops files and errors but keeps pasted text. */
    clearMaterial,
    reset: () => {
      clearMaterial();
      setText('');
    },
  };
}
