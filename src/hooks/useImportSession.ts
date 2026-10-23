/**
 * What both import pages share around their own draft: the leave guard, the start-over decision, and choosing a
 * file by dropping or pasting it. Owns no draft and saves nothing; the page says when it holds a draft, when it is
 * saving and how to clear its own state.
 */
import { useEffect, useState, type DragEvent } from 'react';
import { clipboardFiles } from '../services/importMaterial';
import { useImportGuard } from './useImportGuard';
import type { useImportSource } from './useImportSource';

interface ImportSessionOptions {
  source: ReturnType<typeof useImportSource<unknown>>;
  hasDraft: boolean;
  saving: boolean;
  /** False while another input excludes a file (the article page with pasted text). */
  canChoose: boolean;
  /** Clears the page's own draft and prepared state. */
  clear: () => void;
}

export function useImportSession({ source, hasDraft, saving, canChoose, clear }: ImportSessionOptions) {
  const [restart, setRestart] = useState(false);
  const dirty = hasDraft || source.hasMaterial || !!source.text || source.phase !== 'idle';
  const guard = useImportGuard(dirty, saving, () => {
    source.dispose();
    clear();
  });
  const choosable = !hasDraft && !saving && canChoose && source.phase === 'idle';
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const files = choosable && event.clipboardData ? clipboardFiles(event.clipboardData) : [];
      if (files.length) {
        event.preventDefault();
        void source.choose(files);
      }
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  });
  const keep = () => {
    if (saving) return;
    guard.decide(false);
    setRestart(false);
  };
  return {
    leaveOpen: guard.leaving || restart,
    /** Leaving by a link or Back, or pressing Start over, asks first. */
    startOver: () => setRestart(true),
    release: guard.release,
    keep,
    /** Source-only discard is immediate; review drafts still use Start over's confirmation. */
    discardSource: () => {
      source.reset();
      clear();
    },
    discard: () => {
      if (!restart) return guard.decide(true);
      source.reset();
      clear();
      setRestart(false);
    },
    dropProps: {
      onDragOver: (event: DragEvent) => event.preventDefault(),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (choosable) void source.choose(Array.from(event.dataTransfer.files));
      },
    },
  };
}
