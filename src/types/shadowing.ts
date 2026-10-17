/** Shadowing recordings: the learner's own takes of Reader sentences, kept on this device. */
export const MAX_TAKES = 3;

export interface ShadowingTake {
  id: string;
  recordedAt: number;
  /** The recorder's actual MIME type (webm/opus, mp4...). */
  mimeType: string;
  durationMs: number;
  bytes: number;
  blob: Blob;
}

/** One sentence of one source, keyed by normalized text so edits elsewhere do not move it. */
export interface ShadowingSentence {
  key: string;
  /** Owning material, retained for the existing cascade index. No passage means legacy article prose. */
  articleId: string;
  passage?: { unitId: string };
  /** Trimmed sentence as written when last recorded. */
  text: string;
  /** recordedAt of the newest remaining take. */
  updatedAt: number;
  /** Oldest first, at most MAX_TAKES. */
  takes: ShadowingTake[];
}
