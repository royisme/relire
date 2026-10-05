import { db, type AudioEntry } from './db';

/**
 * Pronunciation audio as a durable asset. Every clip Gemini synthesizes is kept
 * so it is never paid for twice. Clips that belong to the vocabulary (a saved
 * word, its context sentence, its example sentences) are never trimmed; the
 * rest are dropped least-recently-used once the store passes a size cap.
 */

/** Unprotected audio is trimmed beyond this size (WAV, about 48 KB per second). */
export const AUDIO_CAP_BYTES = 200 * 1024 * 1024;

const DAY = 24 * 60 * 60 * 1000;

export const normalizeText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const audioKey = (model: string, voice: string, text: string) => `${model}|${voice}|${normalizeText(text)}`;

export function base64ToBlob(base64: string, type = 'audio/wav'): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Texts whose audio belongs to the vocabulary and must be kept. */
export async function protectedTexts(): Promise<Set<string>> {
  const d = await db();
  const texts = new Set<string>();
  for (const w of await d.getAll('vocab')) {
    if (w.word) texts.add(normalizeText(w.word));
    if (w.contextSentence) texts.add(normalizeText(w.contextSentence));
    for (const ex of w.analysis?.usageExamples ?? []) if (ex.fr) texts.add(normalizeText(ex.fr));
  }
  return texts;
}

export async function getAudio(model: string, voice: string, text: string): Promise<Blob | undefined> {
  try {
    const d = await db();
    const entry = await d.get('audio', audioKey(model, voice, text));
    if (!entry) return undefined;
    // Record use at most once a day so playing a clip is not a write every time.
    // A failed write must not turn a clip we did read into a miss.
    if (Date.now() - entry.lastUsed > DAY) await d.put('audio', { ...entry, lastUsed: Date.now() }).catch(() => undefined);
    return entry.blob;
  } catch {
    return undefined;
  }
}

let approxBytes: number | null = null;

/** Stores a clip and throws if the write fails. Trimming afterwards is best-effort. */
async function storeAudio(model: string, voice: string, text: string, blob: Blob): Promise<void> {
  const d = await db();
  const entry: AudioEntry = {
    key: audioKey(model, voice, text),
    text: normalizeText(text),
    voice,
    model,
    blob,
    bytes: blob.size,
    lastUsed: Date.now(),
  };
  await d.put('audio', entry);
  try {
    // The first time, count what is stored (including this clip); afterwards just add.
    if (approxBytes === null) approxBytes = (await audioStats()).bytes;
    else approxBytes += blob.size;
    if (approxBytes > AUDIO_CAP_BYTES) await trimAudio();
  } catch {
    // The clip is stored; trimming will be retried on a later write.
  }
}

/** Best-effort for playback: if the clip cannot be kept (quota, private mode) it still plays. */
export async function putAudio(model: string, voice: string, text: string, blob: Blob): Promise<void> {
  try {
    await storeAudio(model, voice, text, blob);
  } catch {
    // not kept
  }
}

/** Drops least-recently-used clips that are not protected, down to 80% of the cap. */
export async function trimAudio(cap = AUDIO_CAP_BYTES): Promise<number> {
  const d = await db();
  const keep = await protectedTexts();
  let total = 0;
  const droppable: AudioEntry[] = [];
  const all = await d.getAllFromIndex('audio', 'lastUsed'); // oldest first
  for (const e of all) {
    total += e.bytes;
    if (!keep.has(e.text)) droppable.push(e);
  }
  const target = cap * 0.8;
  let removed = 0;
  for (const e of droppable) {
    if (total <= target) break;
    await d.delete('audio', e.key);
    total -= e.bytes;
    removed++;
  }
  approxBytes = total;
  return removed;
}

export interface AudioStats {
  clips: number;
  bytes: number;
  keptClips: number;
  keptBytes: number;
}

export async function audioStats(): Promise<AudioStats> {
  const stats: AudioStats = { clips: 0, bytes: 0, keptClips: 0, keptBytes: 0 };
  try {
    const d = await db();
    const keep = await protectedTexts();
    for (const e of await d.getAll('audio')) {
      stats.clips++;
      stats.bytes += e.bytes;
      if (keep.has(e.text)) {
        stats.keptClips++;
        stats.keptBytes += e.bytes;
      }
    }
  } catch {
    // leave zeros
  }
  approxBytes = stats.bytes;
  return stats;
}

/** Deletes every clip that is not kept for the vocabulary. */
export async function clearUnprotectedAudio(): Promise<void> {
  const d = await db();
  const keep = await protectedTexts();
  for (const e of await d.getAll('audio')) if (!keep.has(e.text)) await d.delete('audio', e.key);
  approxBytes = null;
}

export interface AudioBackup {
  text: string;
  voice: string;
  model: string;
  data: string; // base64 WAV
}

/** Clips that belong to the vocabulary, for a backup. */
export async function exportProtectedAudio(): Promise<AudioBackup[]> {
  const d = await db();
  const keep = await protectedTexts();
  const out: AudioBackup[] = [];
  for (const e of await d.getAll('audio')) {
    if (keep.has(e.text)) out.push({ text: e.text, voice: e.voice, model: e.model, data: await blobToBase64(e.blob) });
  }
  return out;
}

/** Restores clips from a backup. Unlike playback, a failed write is counted so the caller can report it. */
export async function importAudio(items: AudioBackup[]): Promise<{ imported: number; failed: number }> {
  let imported = 0;
  let failed = 0;
  for (const item of items) {
    if (!item?.text || !item.data) continue;
    try {
      await storeAudio(item.model, item.voice, item.text, base64ToBlob(item.data));
      imported++;
    } catch {
      failed++;
    }
  }
  return { imported, failed };
}
