/** Paragraph-local measured decoration; text, sentence actions and audio remain owned by the reader. */
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PronunciationLayers } from '../../types/pronunciation';
import type { PronunciationSnapshot } from '../../hooks/usePronunciationMarkers';

interface Props {
  children: React.ReactNode;
  snapshot: PronunciationSnapshot;
  sentenceIds: string[];
  layers: PronunciationLayers;
  enabled: boolean;
  fontSize: string;
}
interface Ink {
  left: number;
  right: number;
  bottom: number;
  line: number;
}
interface Curve { path: string; width: number }
interface Dot { x: number; y: number; radius: number }
interface Geometry { curves: Curve[]; dots: Dot[]; width: number; height: number }
const blank: Geometry = { curves: [], dots: [], width: 0, height: 0 };

export function PronunciationParagraph({ children, snapshot, sentenceIds, layers, enabled, fontSize }: Props) {
  const root = useRef<HTMLParagraphElement>(null);
  const [geometry, setGeometry] = useState(blank);
  const ids = sentenceIds.join('|');

  useLayoutEffect(() => {
    const paragraph = root.current;
    if (!paragraph || !enabled) {
      setGeometry(blank);
      return;
    }
    let frame = 0;
    let disposed = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const measure = () => {
      if (disposed) return;
      const box = paragraph.getBoundingClientRect();
      const style = getComputedStyle(paragraph);
      const size = parseFloat(style.fontSize);
      const scale = size / 21;
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const reference = ctx.measureText('Hg');
      const descent = reference.fontBoundingBoxDescent ?? reference.actualBoundingBoxDescent;
      const curves: Curve[] = [];
      const dots: Dot[] = [];
      const glyphInk = (glyph: Element): Ink | null => {
        const range = document.createRange();
        range.selectNodeContents(glyph);
        const rect = Array.from(range.getClientRects()).find((r) => r.width > 0);
        if (!rect) return null;
        const metric = ctx.measureText(glyph.textContent ?? '');
        const baseline = rect.bottom - descent;
        return {
          left: rect.left - metric.actualBoundingBoxLeft - box.left,
          right: rect.left + metric.actualBoundingBoxRight - box.left,
          bottom: baseline + metric.actualBoundingBoxDescent - box.top,
          line: rect.top - box.top,
        };
      };
      const wordGlyphs = (sentence: Element, ordinal: number) =>
        Array.from(sentence.querySelectorAll(`[data-reader-word="${ordinal}"] [data-grapheme]`));
      for (const id of ids.split('|')) {
        const markers = snapshot[id];
        const sentence = paragraph.querySelector(`[data-sentence-id="${id}"]`);
        if (!markers || !sentence) continue;
        for (const connection of markers.connections) {
          const left = wordGlyphs(sentence, connection.left);
          const right = wordGlyphs(sentence, connection.right);
          const a = left.length ? glyphInk(left[left.length - 1]) : null;
          const b = right.length ? glyphInk(right[0]) : null;
          if (!a || !b) continue;
          const width = (connection.type === 'liaison' ? 1.25 : 1) * scale;
          const sag = (connection.type === 'liaison' ? 5 : 3) * scale;
          const x1 = a.right + scale;
          const x2 = b.left - scale;
          if (Math.abs(a.line - b.line) < size * 0.5 && x2 > x1) {
            const y = Math.max(a.bottom, b.bottom) + 4 * scale;
            curves.push({ path: `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + sag * 2} ${x2} ${y}`, width });
          } else {
            // Wrapped pairs get local tails, never a diagonal between lines.
            const end = Math.min(box.width - scale, a.right + 6 * scale);
            const start = Math.max(scale, b.left - 6 * scale);
            const ay = a.bottom + 4 * scale;
            const by = b.bottom + 4 * scale;
            curves.push({ path: `M ${a.right - 2 * scale} ${ay} Q ${end} ${ay + sag * 2} ${end} ${ay + sag}`, width });
            curves.push({ path: `M ${start} ${by + sag} Q ${start} ${by + sag * 2} ${b.left + 2 * scale} ${by}`, width });
          }
        }
        for (const stress of markers.stress) {
          const glyphs = wordGlyphs(sentence, stress.word).slice(stress.anchor.start, stress.anchor.end);
          const fragments = glyphs.map(glyphInk).filter((ink): ink is Ink => ink !== null);
          if (!fragments.length) continue;
          const lastLine = fragments[fragments.length - 1].line;
          const onLine = fragments.filter((ink) => Math.abs(ink.line - lastLine) < size * 0.5);
          dots.push({
            x: (Math.min(...onLine.map((ink) => ink.left)) + Math.max(...onLine.map((ink) => ink.right))) / 2,
            y: Math.max(...onLine.map((ink) => ink.bottom)) + 2.8 * scale,
            radius: 1.3 * scale,
          });
        }
      }
      setGeometry({ curves, dots, width: box.width, height: box.height });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(paragraph);
    window.addEventListener('resize', schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    void document.fonts.ready.then(() => { if (!disposed) schedule(); });
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, [enabled, snapshot, ids, fontSize]);

  return (
    <p ref={root} className="pronunciation-paragraph">
      {children}
      {enabled && (
        <svg
          className="pronunciation-geometry"
          aria-hidden="true"
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width || 1} ${geometry.height || 1}`}
        >
          <g visibility={layers.connections ? 'visible' : 'hidden'} fill="none" stroke="currentColor" strokeLinecap="round">
            {geometry.curves.map((curve, index) => <path key={index} d={curve.path} strokeWidth={curve.width} />)}
          </g>
          <g visibility={layers.stress ? 'visible' : 'hidden'} fill="currentColor">
            {geometry.dots.map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r={dot.radius} />)}
          </g>
        </svg>
      )}
    </p>
  );
}
