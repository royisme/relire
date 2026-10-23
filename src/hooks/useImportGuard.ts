/** In-memory leave decision and native reload warning for import drafts and prepared adaptive sets. */
import { useLayoutEffect, useRef, useState } from 'react';
import { protectImport } from '../utils/importNavigation';
export function useImportGuard(
  dirty: boolean,
  saving: boolean,
  discard: () => void,
  allowDestination?: (href: string) => boolean,
) {
  const [decision, setDecision] = useState<((discard: boolean) => void) | null>(null);
  const release = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (!dirty) return;
    release.current = protectImport((decide) => setDecision(() => decide), allowDestination);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      release.current?.();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, allowDestination]);
  return {
    leaving: !!decision,
    release: () => release.current?.(),
    decide: (leave: boolean) => {
      if (saving) return;
      if (leave) discard();
      setDecision(null);
      decision?.(leave);
    },
  };
}
