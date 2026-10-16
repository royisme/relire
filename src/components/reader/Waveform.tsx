/**
 * The practice card's waveform strip, drawn on a canvas so it never re-renders React.
 * Live: a rolling history of the input level while recording. Take: the recorded take's real
 * peaks, decoded once and cached by take id. Nothing to show: a flat baseline, never invented bars.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

const BAR = 3;
const GAP = 2;
const SAMPLE_MS = 50;
const BUCKETS = 120;

const peaksCache = new Map<string, number[] | null>();

async function decodePeaks(blob: Blob): Promise<number[] | null> {
  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const context = new AudioCtx();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const data = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / BUCKETS));
    const peaks: number[] = [];
    for (let b = 0; b < BUCKETS; b++) {
      let max = 0;
      for (let i = b * size, end = Math.min(data.length, i + size); i < end; i++)
        max = Math.max(max, Math.abs(data[i]));
      peaks.push(max);
    }
    const top = Math.max(...peaks);
    return top > 0 ? peaks.map((p) => p / top) : null;
  } catch {
    // Undecodable here (codec support differs by browser): show the baseline, not made-up bars.
    return null;
  } finally {
    void context.close().catch(() => undefined);
  }
}

type Source = { kind: 'live'; level: () => number } | { kind: 'take'; id: string; blob: Blob } | { kind: 'none' };

export function Waveform({ source, className }: { source: Source; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef<() => number>(() => 0);
  const liveLevel = source.kind === 'live' ? source.level : null;
  useLayoutEffect(() => {
    if (liveLevel) levelRef.current = liveLevel;
  }, [liveLevel]);
  const takeId = source.kind === 'take' ? source.id : null;
  const takeBlob = source.kind === 'take' ? source.blob : null;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let live = true;
    let frame = 0;
    let peaks: number[] | null = null;
    const history: number[] = [];
    let lastSample = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const style = getComputedStyle(el);
      const count = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)));
      const mid = height / 2;
      let values: number[] | null = null;
      if (source.kind === 'live') values = history.slice(-count);
      else if (peaks) values = Array.from({ length: count }, (_, i) => peaks![Math.floor((i / count) * peaks!.length)]);

      if (!values || values.length === 0) {
        ctx.fillStyle = style.getPropertyValue('--color-panel-line');
        ctx.fillRect(0, mid - 0.5, width, 1);
        return;
      }
      ctx.fillStyle = style.getPropertyValue(source.kind === 'live' ? '--color-panel-wave' : '--color-panel-muted');
      // Live bars enter from the right; a take fills the strip.
      const offset = source.kind === 'live' ? width - values.length * (BAR + GAP) + GAP : 0;
      values.forEach((v, i) => {
        const h = Math.max(2, Math.min(1, v) * (height - 2));
        ctx.beginPath();
        ctx.roundRect(offset + i * (BAR + GAP), mid - h / 2, BAR, h, 1.5);
        ctx.fill();
      });
    };

    if (source.kind === 'live') {
      const tick = (now: number) => {
        if (!live) return;
        if (now - lastSample >= SAMPLE_MS) {
          lastSample = now;
          history.push(levelRef.current());
          if (history.length > 400) history.splice(0, history.length - 400);
          draw();
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } else if (takeId && takeBlob) {
      if (peaksCache.has(takeId)) peaks = peaksCache.get(takeId)!;
      else {
        void decodePeaks(takeBlob).then((result) => {
          if (peaksCache.size > 50) peaksCache.delete(peaksCache.keys().next().value!);
          peaksCache.set(takeId, result);
          if (!live) return;
          peaks = result;
          draw();
        });
      }
    }
    draw();
    const observer = new ResizeObserver(() => draw());
    observer.observe(el);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // The source is identified by its kind and take; `level` is read through a ref.
  }, [source.kind, takeId, takeBlob]);

  return <canvas ref={canvas} aria-hidden="true" className={className} />;
}
