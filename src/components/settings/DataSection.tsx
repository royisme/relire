import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cacheCounts, clearCache } from '../../storage/cache';
import { audioStats, clearUnprotectedAudio, type AudioStats } from '../../storage/audio';
import { exportData, getStorageInfo, requestPersistence, type StorageInfo } from '../../storage/db';
import { clearShadowing, shadowingStats, type ShadowingStats } from '../../storage/shadowing';
import { BackupControls } from './BackupControls';

/** Settings → Data and backup: what is stored on this device, saved answers and audio, and backups. Acts immediately. */
export const DataSection: React.FC = () => {
  const { t } = useTranslation();
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({});
  const [cacheInfo, setCacheInfo] = useState({ words: 0, sentences: 0, exercises: 0, prosody: 0 });
  const [audioInfo, setAudioInfo] = useState<AudioStats>({ clips: 0, bytes: 0, keptClips: 0, keptBytes: 0 });
  const [shadowInfo, setShadowInfo] = useState<ShadowingStats>({ sentences: 0, takes: 0, bytes: 0 });
  const [confirmClearShadowing, setConfirmClearShadowing] = useState(false);
  const [shadowError, setShadowError] = useState<string | null>(null);
  const [localStats, setLocalStats] = useState({ articlesCount: 0, vocabCount: 0, statsHistoryCount: 0 });

  useEffect(() => {
    exportData()
      .then((d) =>
        setLocalStats({
          articlesCount: d.articles.length,
          vocabCount: d.vocab.length,
          statsHistoryCount: d.stats.pronunciationHistory?.length || 0,
        }),
      )
      .catch((e) => console.error('Failed to read local stats', e));
    void getStorageInfo().then(setStorageInfo);
    void cacheCounts().then(setCacheInfo);
    void audioStats().then(setAudioInfo);
    shadowingStats().then(setShadowInfo, (e) => setShadowError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-ink-200 flex-wrap gap-2">
          <span className="text-ink-600">{t('settings.offlineSummary')}</span>
          <span className="text-ink-800 tnum">
            {t('settings.articlesCount', { count: localStats.articlesCount })} ·{' '}
            {t('settings.vocabCount', { count: localStats.vocabCount })} ·{' '}
            {t('settings.historyCount', { count: localStats.statsHistoryCount })}
          </span>
        </div>

        <p className="text-xs text-ink-500 leading-relaxed">{t('settings.offlineDesc')}</p>

        {/* Saved AI answers */}
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-ink-600">
            {t('settings.cacheSummary', {
              words: cacheInfo.words,
              sentences: cacheInfo.sentences,
              exercises: cacheInfo.exercises,
              prosody: cacheInfo.prosody,
            })}
          </span>
          <button
            type="button"
            disabled={cacheInfo.words + cacheInfo.sentences + cacheInfo.exercises + cacheInfo.prosody === 0}
            onClick={async () => {
              await clearCache();
              setCacheInfo(await cacheCounts());
              setStorageInfo(await getStorageInfo());
            }}
            className="h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {t('settings.clearCache')}
          </button>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">{t('settings.cacheDesc')}</p>

        {/* Pronunciation audio */}
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-ink-600 tnum">
            {t('settings.audioSummary', {
              clips: audioInfo.clips,
              mb: (audioInfo.bytes / 1024 / 1024).toFixed(1),
              kept: audioInfo.keptClips,
            })}
          </span>
          <button
            type="button"
            disabled={audioInfo.clips === audioInfo.keptClips}
            onClick={async () => {
              await clearUnprotectedAudio();
              setAudioInfo(await audioStats());
              setStorageInfo(await getStorageInfo());
            }}
            className="h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {t('settings.clearAudio')}
          </button>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">{t('settings.audioDesc')}</p>

        {/* Shadowing recordings */}
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-ink-600 tnum">
            {t('settings.shadowingSummary', {
              sentences: shadowInfo.sentences,
              takes: shadowInfo.takes,
              mb: (shadowInfo.bytes / 1024 / 1024).toFixed(1),
            })}
          </span>
          {confirmClearShadowing ? (
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-ink-800">{t('settings.clearShadowingConfirm')}</span>
              <button
                type="button"
                onClick={async () => {
                  setConfirmClearShadowing(false);
                  setShadowError(null);
                  try {
                    await clearShadowing();
                    setShadowInfo(await shadowingStats());
                    setStorageInfo(await getStorageInfo());
                  } catch (e) {
                    setShadowError(e instanceof Error ? e.message : String(e));
                  }
                }}
                className="h-9 px-3 rounded-md border border-bad-700 bg-surface text-bad-700 hover:bg-ink-100 font-medium cursor-pointer"
              >
                {t('settings.clearShadowing')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearShadowing(false)}
                className="h-9 px-3 rounded-md text-ink-800 hover:bg-ink-100 font-medium cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={shadowInfo.takes === 0}
              onClick={() => setConfirmClearShadowing(true)}
              className="h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              {t('settings.clearShadowing')}
            </button>
          )}
        </div>
        {shadowError && (
          <p role="alert" className="text-xs text-bad-700 break-words">
            {t('settings.shadowingFailed', { msg: shadowError })}
          </p>
        )}

        {/* Storage protection */}
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-ink-600">
            {storageInfo.usage !== undefined && (
              <span className="tnum">{(storageInfo.usage / 1024 / 1024).toFixed(1)} MB · </span>
            )}
            {storageInfo.persisted ? t('settings.storageProtected') : t('settings.storageNotProtected')}
          </span>
          {storageInfo.persisted === false && (
            <button
              type="button"
              onClick={async () => {
                await requestPersistence();
                setStorageInfo(await getStorageInfo());
              }}
              className="h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium cursor-pointer"
            >
              {t('settings.protectStorage')}
            </button>
          )}
        </div>

        <BackupControls audioBytes={audioInfo.keptBytes} shadowingBytes={shadowInfo.bytes} />
      </div>
    </div>
  );
};
