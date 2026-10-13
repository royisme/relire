/**
 * Fixed provider-neutral output shape. Sentence-dependent array bounds and
 * ordinal enums can exceed Gemini's serving-time schema state budget even
 * for short sentences. Keep types, small enums and required fields here;
 * exact occurrence counts and every spelling check belong to the runtime parser.
 *
 * The model writes spelling, never grapheme indices: each syllable pairs its
 * spelling (silent letters in parentheses) with its IPA, so syllable counts
 * cannot disagree, and the client derives every range.
 */
const index = { type: 'integer' };

export const prosodySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          ordinal: index,
          source: { type: 'string' },
          status: { type: 'string', enum: ['resolved', 'unresolved'] },
          syllables: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { spelling: { type: 'string' }, ipa: { type: 'string' } },
              required: ['spelling', 'ipa'],
            },
          },
          groupEnd: { type: 'boolean' },
        },
        required: ['ordinal', 'source', 'status', 'syllables', 'groupEnd'],
      },
    },
    connections: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          left: index,
          type: { type: 'string', enum: ['liaison', 'enchainement'] },
          sound: { type: 'string' },
          spelling: { type: 'string' },
        },
        required: ['left', 'type', 'sound', 'spelling'],
      },
    },
  },
  required: ['words', 'connections'],
};
