import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSetting, setSetting } from "@/db/queries/settings";

export function useLanguage() {
  const { i18n } = useTranslation();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSetting("language").then((lang) => {
      if (lang && lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
      setLoaded(true);
    });
  }, [i18n]);

  const changeLanguage = useCallback(
    async (code: string) => {
      await i18n.changeLanguage(code);
      await setSetting("language", code);
    },
    [i18n],
  );

  return { language: i18n.language, changeLanguage, loaded };
}
