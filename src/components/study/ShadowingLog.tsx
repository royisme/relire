/** My study → Shadowing: every recorded sentence as "text | reference | my recordings". Display only. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ChevronDown, Trash2 } from 'lucide-react';
import type { Article } from '../../types';
import type { ShadowingTake } from '../../types/shadowing';
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
  /** Article to show first (from the practice card's "All recordings"). */
  initialArticleId: string | null;
  onOpenSentence: (articleId: string, text: string) => void;
}

export function ShadowingLog({ articles, initialArticleId, onOpenSentence }: Props) {
  const { t } = useTranslation();
  const log = useShadowingLog(articles);
  const [articleId, setArticleId] = useState<string>(initialArticleId ?? 'all');
  const [failure, setFailure] = useState<string | null>(null);

  // Leaving the log stops a recording it is playing.
  useEffect(() => () => {
    if (getSpeechState().key?.startsWith('take:')) stopSpeech();
  }, []);

  const groups = articleId === 'all' ? log.groups : log.groups.filter((g) => g.article.id === articleId);
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
        actions={log.groups.length > 1 ? (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <span>{t('shadowingLog.article')}</span>
            <select
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              className="h-10 max-w-[16rem] rounded-md border border-ink-200 bg-surface px-2 text-sm text-ink-900"
            >
              <option value="all">{t('shadowingLog.allArticles')}</option>
              {log.groups.map((g) => <option key={g.article.id} value={g.article.id}>{cleanArticleTitle(g.article.title)}</option>)}
            </select>
          </label>
        ) : undefined}
      />

      {failure && <p role="alert" className="text-sm text-bad-700 break-words">{t('shadowingLog.deleteFailed', { msg: failure })}</p>}

      {log.error ? (
        <p role="alert" className="text-sm text-bad-700 break-words">{t('shadowingLog.loadFailed', { msg: log.error })}</p>
      ) : log.loading ? (
        <div className="min-h-40" aria-busy="true" />
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-ink-600">{t('shadowingLog.empty')}</p>
      ) : (
        <>
          <p className="text-xs text-ink-500">{t('shadowingLog.referenceVoice')}</p>
          {groups.map((group) => (
            <section key={group.article.id} className="space-y-2">
              <h3 className="font-serif text-lg font-semibold text-ink-900 break-words">
                {cleanArticleTitle(group.article.title)}
                <span className="ml-2 font-sans text-xs font-normal text-ink-500">{t('shadowingLog.recorded', { count: group.rows.length + group.changed.length })}</span>
              </h3>
              <div className="hidden md:grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,18rem)] gap-3 px-3 text-xs text-ink-500">
                <span>{t('shadowingLog.text')}</span>
                <span>{t('shadowingLog.reference')}</span>
                <span>{t('shadowingLog.mine')}</span>
              </div>
              <ul className="divide-y divide-ink-200 border-y border-ink-200">
                {group.rows.map((row) => (
                  <Row key={row.record.key} row={row} onOpen={() => onOpenSentence(group.article.id, row.record.text)} onDelete={remove} />
                ))}
              </ul>
              {group.changed.length > 0 && (
                <Orphans title={t('shadowingLog.changed', { count: group.changed.length })} rows={group.changed} onDelete={remove} />
              )}
            </section>
          ))}
          {articleId === 'all' && log.removed.length > 0 && (
            <Orphans title={t('shadowingLog.removed', { count: log.removed.length })} rows={log.removed} onDelete={remove} />
          )}
        </>
      )}
    </div>
  );
}

function Orphans({ title, rows, onDelete }: { title: string; rows: LogRow[]; onDelete: (key: string, take: ShadowingTake) => void }) {
  return (
    <details className="pt-1">
      <summary className="min-h-10 flex items-center cursor-pointer text-sm text-ink-700">{title}</summary>
      <ul className="divide-y divide-ink-200 border-y border-ink-200">
        {rows.map((row) => <Row key={row.record.key} row={row} onDelete={onDelete} />)}
      </ul>
    </details>
  );
}

function Row({ row, onOpen, onDelete }: { row: LogRow; onOpen?: () => void; onDelete: (key: string, take: ShadowingTake) => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const { record } = row;
  const latest = record.takes[record.takes.length - 1];
  const latestPhase = useSpeechPhase(takeKey(latest));
  const when = (take: ShadowingTake) => new Date(take.recordedAt).toLocaleString(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const compare = () => void speakFrench(record.text, {
    onSettled: (outcome) => {
      if (outcome === 'ended') void playRecording(latest.blob, takeKey(latest));
    },
  });

  return (
    <li className="px-3 py-3 space-y-2">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_5rem_minmax(0,18rem)] md:gap-3 md:items-center">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="text-left font-serif text-base text-ink-900 break-words hover:underline underline-offset-4 cursor-pointer" title={t('shadowingLog.openInReader')}>
            {record.text}
          </button>
        ) : (
          <p className="font-serif text-base text-ink-700 break-words">{record.text}</p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <SpeakButton text={record.text} label={t('shadowingLog.playReference')} stopLabel={t('reader.stop')} variant="outline" size="icon" />
          <span className="md:hidden text-xs text-ink-500">{t('shadowingLog.reference')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => (latestPhase === 'idle' ? void playRecording(latest.blob, takeKey(latest)) : stopSpeech())} aria-label={t('shadowingLog.playTake', { when: when(latest) })} className="min-h-10">
            <SpeakIcon phase={latestPhase} className="w-3.5 h-3.5" />
            <span className="tnum">{when(latest)}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={compare} title={t('practiceCard.compareTitle')} className="min-h-10">
            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('practiceCard.compare')}</span>
          </Button>
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-10" aria-label={t('shadowingLog.allTakes', { count: record.takes.length })}>
            <span className="tnum">{record.takes.length}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {open && (
        <ul className="space-y-1 md:pl-4">
          {[...record.takes].reverse().map((take) => <TakeLine key={take.id} take={take} label={when(take)} onDelete={() => onDelete(record.key, take)} />)}
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
      <Button variant="ghost" size="sm" className="min-h-10" onClick={() => (phase === 'idle' ? void playRecording(take.blob, takeKey(take)) : stopSpeech())} aria-label={t('shadowingLog.playTake', { when: label })}>
        <SpeakIcon phase={phase} className="w-3.5 h-3.5" />
        <span className="tnum">{label} · {clock(take.durationMs)}</span>
      </Button>
      <Button variant="ghost" size="sm" className="min-h-10 text-bad-700" onClick={onDelete} aria-label={t('shadowingLog.deleteTake', { when: label })}>
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{t('shadowingLog.delete')}</span>
      </Button>
    </li>
  );
}
