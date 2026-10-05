import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const STORAGE_KEY = 'eclair_lang';

// Default to English as requested, or load user's previously saved preference
const savedLang = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : 'en';
const initialLang = savedLang === 'zh' ? 'zh' : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already protects against XSS
    },
  });

/** Interface languages. Add an entry here (plus a locale file) to offer another one. */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '简体中文' },
] as const;

export function setAppLanguage(lang: 'en' | 'zh') {
  i18n.changeLanguage(lang);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }
}

export function getAppLanguage(): 'en' | 'zh' {
  return (i18n.language === 'zh' ? 'zh' : 'en');
}

export default i18n;
