/**
 * Lets the practice card leave the bottom dock and float where the learner drags it (mouse and keyboard
 * only; touch keeps it docked). The position is remembered in this browser; double-click or Home docks it.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

const KEY = 'relire_practice_card_pos';
const MARGIN = 8;
const HEADER = 64;

interface Point {
  x: number;
  y: number;
}

function readPosition(): Point | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
  } catch {
    return null;
  }
}

function savePosition(point: Point | null) {
  try {
    if (point) localStorage.setItem(KEY, JSON.stringify(point));
    else localStorage.removeItem(KEY);
  } catch {
    // The position still applies until the page closes.
  }
}

export function useFloatingCard(enabled: boolean, card: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<Point | null>(readPosition);
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);

  // Keep the whole card on screen.
  const clamp = useCallback((point: Point): Point => {
    const box = card.current?.getBoundingClientRect();
    const width = box?.width ?? 448;
    const height = box?.height ?? 300;
    return {
      x: Math.round(Math.min(Math.max(MARGIN, point.x), window.innerWidth - width - MARGIN)),
      y: Math.round(Math.min(Math.max(HEADER, point.y), window.innerHeight - height - MARGIN)),
    };
  }, [card]);

  const floating = enabled && position !== null;

  // A smaller window, or the card growing (restore, a long error), must not push it off screen.
  useEffect(() => {
    if (!floating) return;
    const refit = () => setPosition((p) => {
      if (!p) return p;
      const next = clamp(p);
      return next.x === p.x && next.y === p.y ? p : next;
    });
    refit();
    window.addEventListener('resize', refit);
    const observer = new ResizeObserver(refit);
    if (card.current) observer.observe(card.current);
    return () => {
      window.removeEventListener('resize', refit);
      observer.disconnect();
    };
  }, [floating, clamp, card]);

  const dock = () => {
    setPosition(null);
    savePosition(null);
  };

  const handleProps = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0 || !card.current) return;
      const box = card.current.getBoundingClientRect();
      drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top, id: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const start = drag.current;
      if (!start || start.id !== e.pointerId) return;
      setPosition(clamp({ x: e.clientX - start.dx, y: e.clientY - start.dy }));
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (!drag.current || drag.current.id !== e.pointerId) return;
      drag.current = null;
      setPosition((p) => {
        savePosition(p);
        return p;
      });
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onDoubleClick: dock,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!enabled || !card.current) return;
      if (e.key === 'Home') {
        e.preventDefault();
        dock();
        return;
      }
      const step = e.shiftKey ? 64 : 16;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!move) return;
      e.preventDefault();
      const box = card.current.getBoundingClientRect();
      const next = clamp({ x: box.left + move[0], y: box.top + move[1] });
      setPosition(next);
      savePosition(next);
    },
  };

  const style: CSSProperties | undefined = floating ? { position: 'fixed', left: position.x, top: position.y } : undefined;
  return { floating, style, handleProps, dock };
}
