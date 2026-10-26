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

/** Who owns a recording: an article's prose, a unit's reading passage, or a graded-reader edition. */
type ShadowingOwner =
  | { articleId: string; passage?: undefined; graded?: undefined }
  | { articleId?: undefined; passage: { unitId: string }; graded?: undefined }
  | { articleId?: undefined; passage?: undefined; graded: { readerId: string; version: string } };

/** One sentence of one source, keyed by normalized text so edits elsewhere do not move it. */
export type ShadowingSentence = ShadowingOwner & {
  key: string;
  /** Trimmed sentence as written when last recorded. */
  text: string;
  /** recordedAt of the newest remaining take. */
  updatedAt: number;
  /** Oldest first, at most MAX_TAKES. */
  takes: ShadowingTake[];
};
