/** Game-only bookkeeping; never writes scheduler rows or infers activity from challenge answers. */
import { useEffect, useRef } from 'react';
import { appendRunLog } from '../../../services/vocabulary/game/runLog';
import { getAppSettings, saveAppSettings } from '../../../utils/appSettings';
import { formatDate } from '../../../utils/srs';
import { chunkReached, type RunChunk } from './runModel';

interface RunProgress {
  size: RunChunk['size'];
  chunkBaseline: number;
  logged: number;
  ratings: number;
  now: number;
}

function flush(progress: RunProgress) {
  if (progress.ratings === progress.logged) return;
  saveAppSettings({
    vocabularyRunLog: appendRunLog(getAppSettings().vocabularyRunLog, {
      date: formatDate(new Date(progress.now)),
      mode: 'game',
      chunkSize: progress.size,
      ratings: progress.ratings - progress.logged,
    }),
  });
  progress.logged = progress.ratings;
}

export function useRunLog(chunk: RunChunk, ratings: number, now: number, queueEmpty: boolean) {
  const progress = useRef<RunProgress>({ size: chunk.size, chunkBaseline: chunk.baseline, logged: 0, ratings: 0, now });
  useEffect(() => {
    const current = progress.current;
    if (current.size !== chunk.size || current.chunkBaseline !== chunk.baseline) {
      flush(current);
      current.size = chunk.size;
      current.chunkBaseline = chunk.baseline;
      current.logged = current.ratings;
    }
    current.ratings = ratings;
    current.now = now;
    if (queueEmpty || chunkReached(chunk, ratings)) flush(current);
  }, [chunk, ratings, now, queueEmpty]);

  useEffect(() => () => flush(progress.current), []);
}
