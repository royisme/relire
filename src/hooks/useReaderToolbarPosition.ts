/** Owns floating sentence-toolbar geometry and measurement cleanup, not sentence selection or toolbar rendering. */
import { useLayoutEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { PronunciationSnapshot } from './usePronunciationMarkers';

export interface ReaderToolbarPosition {
  id: string;
  text: string;
  top: number;
  left: number;
}

interface ReaderToolbarPositionOptions {
  touch: boolean;
  actionId: string | null;
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  sourceId: string;
  content: string;
  markerMode: boolean;
  displayedMarkers: PronunciationSnapshot;
  sentenceEls: RefObject<Map<string, { el: HTMLElement; text: string; key: string }>>;
  articleRef: RefObject<HTMLElement | null>;
  setToolbar: Dispatch<SetStateAction<ReaderToolbarPosition | null>>;
}

export function useReaderToolbarPosition({
  touch,
  actionId,
  fontSize,
  sourceId,
  content,
  markerMode,
  displayedMarkers,
  sentenceEls,
  articleRef,
  setToolbar,
}: ReaderToolbarPositionOptions) {
  useLayoutEffect(() => {
    const NAV = 56; // sticky header
    // Measured pill size: three h-7 buttons, a divider, gap-0.5, p-1 padding and border = 101 x 38,
    // plus an 8px invisible lead-in on its left.
    const TOOLBAR_WIDTH = 101;
    const TOOLBAR_HEIGHT = 38;
    const LEAD = 8;
    let frame = 0;

    const place = () => {
      const id = touch ? null : actionId;
      const target = id ? sentenceEls.current.get(id) : undefined;
      const article = articleRef.current;
      const vh = window.innerHeight;
      // Only lines that are on screen can carry the toolbar.
      const lines = target ? [...target.el.getClientRects()].filter((r) => r.bottom > NAV && r.top < vh) : [];
      if (!target || !article || !lines.length) {
        setToolbar((prev) => (prev ? null : prev));
        return;
      }
      // The pill sits on the sentence's last visible line, right after its final character, so the pointer
      // reaches it by moving along that line and never crosses another sentence (which would retarget the
      // pill). It is centred on the line and no taller than the line pitch, so it covers no other line.
      const lastLine = lines[lines.length - 1];
      const box = article.getBoundingClientRect();
      const top = (lastLine.top + lastLine.bottom) / 2 - TOOLBAR_HEIGHT / 2 - box.top;
      // The invisible lead-in overlaps the sentence end, so there is no gap to cross; when the sentence ends
      // too near the column edge, the pill moves left over the sentence's own last words instead.
      const left = Math.min(lastLine.right - box.left - LEAD + 2, box.width - TOOLBAR_WIDTH - LEAD - 6);

      const next = {
        id: id!,
        text: target.text,
        top,
        left,
      };
      setToolbar((prev) =>
        prev &&
        prev.id === next.id &&
        prev.text === next.text &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.left - next.left) < 0.5
          ? prev
          : next,
      );
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    place();
    const observer = new ResizeObserver(schedule);
    if (articleRef.current) observer.observe(articleRef.current);
    document.fonts.addEventListener('loadingdone', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
    };
    // Refs and the state setter are stable reader-owned inputs; retain the original measurement triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touch, actionId, fontSize, sourceId, content, markerMode, displayedMarkers]);
}
