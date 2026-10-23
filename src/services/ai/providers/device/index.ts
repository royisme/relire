import { DeviceVoiceError } from '../../errors';
import type { Provider } from '../../types';

/**
 * The platform's own voice (SpeechSynthesis) as a selectable engine: it needs no key, has no model and no
 * voice list, speaks with whatever French voice the device has, costs nothing, and never returns a clip.
 * `info.speech.device` is the one declaration Settings, the access boundary and playback all read.
 */
export const device: Provider = {
  info: {
    id: 'device',
    // No key page: there is nothing to create, and Settings hides the key field for a device engine.
    requiresKey: false,
    speech: { device: true, models: [], defaultModel: '', voices: [], defaultVoice: '' },
  },
  speech: {
    synthesize(): Promise<Blob> {
      throw new DeviceVoiceError();
    },
  },
};
