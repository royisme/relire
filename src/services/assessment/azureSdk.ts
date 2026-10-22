/**
 * The Azure Speech SDK, reached only through a dynamic import so its bundle never
 * lands in the main chunk: a learner pays for it when a check needs it, not on load.
 * Owns the seam and nothing else; the assessment provider (#56) calls it.
 */
export const loadAzureSdk = async () => (await import('microsoft-cognitiveservices-speech-sdk')).default;
