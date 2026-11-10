/**
 * The Azure Speech SDK, reached only through a dynamic import so its bundle never
 * lands in the main chunk. Workbox still precaches the emitted lazy chunk for offline use.
 * Owns the loading seam only; the assessment provider calls it on explicit execution.
 */
export const loadAzureSdk = async () => (await import('microsoft-cognitiveservices-speech-sdk')).default;
