/** Controllable platform voice for key-free listening checks; never plays real audio or calls a provider. */
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    deviceSpeechTest: { spoken: string[]; noFrench: boolean; finish: () => void };
  }
}

export async function mockConjugationDeviceVoice(page: Page) {
  await page.addInitScript(() => {
    let current: { text: string; onend: (() => void) | null } | null = null;
    const control = { spoken: [] as string[], noFrench: false, finish: () => current?.onend?.() };
    window.deviceSpeechTest = control;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ lang: control.noFrench ? 'en-US' : 'fr-FR', name: 'Test device voice' }],
        cancel: () => {
          current = null;
        },
        speak: (utterance: typeof current) => {
          current = utterance;
          control.spoken.push(utterance!.text);
        },
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
  });
  await page.goto('about:blank');
}
