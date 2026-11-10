/**
 * The Fish Audio voice id rule, owned here: storage, Save, Settings and the speech request all call it, so a
 * name another provider would accept (an OpenAI preset) can never become a Fish voice.
 */

/** OpenAI speech preset names are not Fish reference ids. */
const OPENAI_PRESET_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
]);

/** A Fish reference id: letters, digits, dot, dash or underscore, 8 to 96 characters. */
const VOICE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/;

/** Empty means the provider's default voice; otherwise a real Fish voice id. */
export function isValidFishVoiceId(voice: string): boolean {
  const value = voice.trim();
  if (!value) return true;
  return VOICE_ID.test(value) && !OPENAI_PRESET_VOICES.has(value.toLowerCase());
}
