/**
 * Fixed provider-neutral output shape. Sentence-dependent array bounds and
 * ordinal enums can exceed Gemini's serving-time schema state budget even
 * for short sentences. Keep types, small enums and required fields here;
 * exact occurrence counts and every range belong to the runtime validator.
 */
const index = { type: 'integer' };
const span = {
  type: 'object', additionalProperties: false,
  properties: { start: index, end: index },
  required: ['start', 'end'],
};

export const prosodySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    version: { type: 'integer', enum: [1] },
    source: { type: 'string' },
    words: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          ordinal: index,
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
      items: {
        type: 'object', additionalProperties: false,
        properties: { word: index, syllable: index, anchor: span },
        required: ['word', 'syllable', 'anchor'],
      },
    },
  },
  required: ['version', 'source', 'words', 'connections', 'stress'],
};
