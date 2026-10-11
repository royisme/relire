/**
 * Provider-neutral structured-output shape, built per sentence. Serving-time
 * constraints (large string/array bounds, integer ranges) are rejected by
 * providers that evaluate schema state space, so only types, enums, required
 * fields and the exact token count live here; every numeric bound is enforced
 * by the runtime validator (utils/pronunciationMarkers.ts) before caching or
 * rendering.
 */
const index = { type: 'integer' };
const span = {
  type: 'object', additionalProperties: false,
  properties: { start: index, end: index },
  required: ['start', 'end'],
};

/** Exact counts are cheap for the schema state space; huge bounds are not. */
const COUNTABLE = 60;

/** `tokens` is the number of enumerated word occurrences in the sentence. */
export function prosodySchemaFor(tokens: number) {
  const counted = Number.isInteger(tokens) && tokens >= 0 && tokens <= COUNTABLE;
  return {
    type: 'object', additionalProperties: false,
    properties: {
      version: { type: 'integer', enum: [1] },
      source: { type: 'string' },
      words: {
        type: 'array',
        ...(counted ? { minItems: tokens, maxItems: tokens } : {}),
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            ordinal: counted && tokens ? { type: 'integer', enum: Array.from({ length: tokens }, (_, i) => i) } : index,
            source: { type: 'string' },
            status: { type: 'string', enum: ['resolved', 'unresolved'] },
            ipa: { type: 'array', items: { type: 'string' } },
            boundaries: { type: 'array', items: index },
            silent: { type: 'array', items: span },
          },
          required: ['ordinal', 'source', 'status', 'ipa', 'boundaries', 'silent'],
        },
      },
      connections: {
        type: 'array',
        ...(counted && tokens > 1 ? { maxItems: tokens - 1 } : {}),
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            left: index, right: index,
            type: { type: 'string', enum: ['liaison', 'enchainement'] },
            sound: { type: 'string' },
            pronounced: span,
          },
          required: ['left', 'right', 'type', 'sound', 'pronounced'],
        },
      },
      stress: {
        type: 'array',
        ...(counted ? { maxItems: tokens } : {}),
        items: {
          type: 'object', additionalProperties: false,
          properties: { word: index, syllable: index, anchor: span },
          required: ['word', 'syllable', 'anchor'],
        },
      },
    },
    required: ['version', 'source', 'words', 'connections', 'stress'],
  };
}

/** Fallback shape when no enumeration is available (token count unknown). */
export const prosodySchema = prosodySchemaFor(-1);
