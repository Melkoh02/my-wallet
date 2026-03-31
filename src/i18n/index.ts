import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "./locales/en.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
] as const;

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

function getDeviceLanguage(): string {
  const locales = getLocales();
  if (locales.length > 0) {
    const lang = locales[0].languageCode;
    if (lang && SUPPORTED_CODES.includes(lang as (typeof SUPPORTED_CODES)[number])) {
      return lang;
    }
  }
  return "en";
}

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    pt: { translation: pt },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: getDeviceLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
