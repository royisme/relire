/** My study → Shadowing: sentence-first history with playback and per-take actions. */
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ChevronDown, Trash2 } from 'lucide-react';
import type { Article } from '../../types';
import type { ExerciseUnit } from '../../types/exercises';
import type { ShadowingSentence, ShadowingTake } from '../../types/shadowing';
import { useShadowingLog, type LogRow } from '../../hooks/useShadowingLog';
import { takeKey } from '../../hooks/usePracticeCard';
import { deleteTake } from '../../storage/shadowing';
import { errorMessage } from '../../services/ai/errors';
import { playRecording, speakFrench, stopSpeech } from '../../utils/speech';
import { getSpeechState } from '../../utils/speech/state';
import { cleanArticleTitle } from '../../utils/i18nHelpers';
import { PageHeader } from '../ui/page-header';
import { Button } from '../ui/button';
import { SpeakButton, SpeakIcon, useSpeechPhase } from '../ui/speak-button';

const clock = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  articles: Article[];
  units: ExerciseUnit[] | null;
  unitsError: string | null;
  /** Source to show first (from the practice card's "All recordings"). */
  initialSourceId: string | null;
  onOpenSentence: (record: ShadowingSentence) => void;
}

export function ShadowingLog({ articles, units, unitsError, initialSourceId, onOpenSentence }: Props) {
  const { t } = useTranslation();
  const log = useShadowingLog(articles, units, unitsError);
  const [sourceId, setSourceId] = useState<string>(initialSourceId ?? 'all');
  const [failure, setFailure] = useState<string | null>(null);

  // Leaving the log stops a recording it is playing.
  useEffect(
    () => () => {
      if (getSpeechState().key?.startsWith('take:')) stopSpeech();
    },
    [],
  );

  // A source that no longer has anything under its own heading (deleted) is shown as "all": the log
  // must never hide the other recordings behind a stale selection.
  const effectiveSourceId = sourceId === 'all' || log.groups.some((g) => g.id === sourceId) ? sourceId : 'all';
  const groups = effectiveSourceId === 'all' ? log.groups : log.groups.filter((g) => g.id === effectiveSourceId);
  const remove = (key: string, take: ShadowingTake) => {
    setFailure(null);
    deleteTake(key, take.id).catch((err) => setFailure(errorMessage(err)));
  };
  const total = log.groups.reduce((n, g) => n + g.rows.length + g.changed.length, 0) + log.removed.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('shadowingLog.title')}
        subtitle={t('shadowingLog.subtitle')}
        actions={
          log.groups.length > 1 || log.removed.length > 0 ? (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <span>{t('shadowingLog.source')}</span>
              <select
                value={effectiveSourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="h-10 max-w-[16rem] rounded-md border border-ink-200 bg-surface px-2 text-sm text-ink-900"
              >
                <option value="all">{t('shadowingLog.allSources')}</option>
                {log.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {cleanArticleTitle(g.document.title)}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      />

      {failure && (
        <p role="alert" className="text-sm text-bad-700 break-words">
          {t('shadowingLog.deleteFailed', { msg: failure })}
        </p>
      )}

      {log.error ? (
        <p role="alert" className="text-sm text-bad-700 break-words">
          {t('shadowingLog.loadFailed', { msg: log.error })}
        </p>
      ) : log.loading ? (
        <div className="min-h-40" aria-busy="true" />
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-ink-600">{t('shadowingLog.empty')}</p>
      ) : (
        <>
          <p className="text-xs text-ink-500">{t('shadowingLog.referenceVoice')}</p>
          {groups.map((group) => (
            <section key={group.id} className="space-y-2">
              <h3 className="font-serif text-lg font-semibold text-ink-900 break-words">
                {cleanArticleTitle(group.document.title)}
                <span className="ml-2 font-sans text-xs font-normal text-ink-500">
                  {t('shadowingLog.recorded', { count: group.rows.length + group.changed.length })}
                </span>
              </h3>
              <ul className="divide-y divide-ink-200 border-y border-ink-200">
                {group.rows.map((row) => (
                  <Row key={row.record.key} row={row} onOpen={() => onOpenSentence(row.record)} onDelete={remove} />
                ))}
              </ul>
              {group.changed.length > 0 && (
                <Orphans
                  title={t('shadowingLog.changed', { count: group.changed.length })}
                  rows={group.changed}
                  onDelete={remove}
                />
              )}
            </section>
          ))}
          {effectiveSourceId === 'all' && log.removed.length > 0 && (
            <Orphans
              title={t('shadowingLog.removed', { count: log.removed.length })}
              rows={log.removed}
              onDelete={remove}
            />
          )}
        </>
      )}
    </div>
  );
}

function Orphans({
  title,
  rows,
  onDelete,
}: {
  title: string;
  rows: LogRow[];
  onDelete: (key: string, take: ShadowingTake) => void;
}) {
  return (
    <details className="pt-1">
      <summary className="min-h-10 flex items-center cursor-pointer text-sm text-ink-700">{title}</summary>
      <ul className="divide-y divide-ink-200 border-y border-ink-200">
        {rows.map((row) => (
          <Row key={row.record.key} row={row} onDelete={onDelete} />
        ))}
      </ul>
    </details>
  );
}

function Row({
  row,
  onOpen,
  onDelete,
}: {
  row: LogRow;
  onOpen?: () => void;
  onDelete: (key: string, take: ShadowingTake) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const takesId = useId();
  const { record } = row;
  const latest = record.takes[record.takes.length - 1];
  const latestPhase = useSpeechPhase(takeKey(latest));
  const when = (take: ShadowingTake) =>
    new Date(take.recordedAt).toLocaleString(i18n.language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const compare = () =>
    void speakFrench(record.text, {
      onSettled: (outcome) => {
        if (outcome === 'ended') void playRecording(latest.blob, takeKey(latest));
      },
    });

  return (
    <li className="min-w-0 py-4 space-y-2">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block min-h-10 w-full text-left font-serif text-base text-ink-900 break-words hover:underline underline-offset-4 cursor-pointer"
          title={t('shadowingLog.openInReader')}
        >
          {record.text}
        </button>
      ) : (
        <p className="font-serif text-base text-ink-700 break-words">{record.text}</p>
      )}
      <div className="flex flex-wrap items-center gap-2" data-shadowing-actions>
        <SpeakButton
          text={record.text}
          label={t('shadowingLog.reference')}
          stopLabel={t('reader.stop')}
          showLabel
          variant="outline"
          size="sm"
          className="min-h-10"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => (latestPhase === 'idle' ? void playRecording(latest.blob, takeKey(latest)) : stopSpeech())}
          aria-label={t('shadowingLog.playLatest')}
          aria-busy={latestPhase === 'loading'}
          className="min-h-10"
        >
          <SpeakIcon phase={latestPhase} className="w-3.5 h-3.5" />
          <span>{t('shadowingLog.playLatest')}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={compare} title={t('practiceCard.compareTitle')} className="min-h-10">
          <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('practiceCard.compare')}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={open ? takesId : undefined}
          onClick={() => setOpen(!open)}
          className="min-h-10"
          aria-label={t('shadowingLog.allTakes', { count: record.takes.length })}
        >
          <span className="tnum">{t('shadowingLog.allTakes', { count: record.takes.length })}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </Button>
      </div>
      <p className="tnum text-xs text-ink-500">
        {t('shadowingLog.lastRecorded', { when: when(latest) })} · {clock(latest.durationMs)}
      </p>
      {open && (
        <ul id={takesId} className="space-y-1 border-t border-ink-200 pt-2">
          {[...record.takes].reverse().map((take) => (
            <TakeLine key={take.id} take={take} label={when(take)} onDelete={() => onDelete(record.key, take)} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TakeLine({ take, label, onDelete }: { take: ShadowingTake; label: string; onDelete: () => void }) {
  const { t } = useTranslation();
  const phase = useSpeechPhase(takeKey(take));
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs text-ink-700">
      <Button
        variant="ghost"
        size="sm"
        className="min-h-10"
        onClick={() => (phase === 'idle' ? void playRecording(take.blob, takeKey(take)) : stopSpeech())}
        aria-label={t('shadowingLog.playTake', { when: label })}
      >
        <SpeakIcon phase={phase} className="w-3.5 h-3.5" />
        <span className="tnum">
          {label} · {clock(take.durationMs)}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-10 text-bad-700"
        onClick={onDelete}
        aria-label={t('shadowingLog.deleteTake', { when: label })}
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{t('shadowingLog.delete')}</span>
      </Button>
    </li>
  );
}
