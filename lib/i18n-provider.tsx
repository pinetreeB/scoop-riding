import React, { createContext, useContext, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { initI18n, changeLanguage, getCurrentLanguage, getSavedLanguagePreference, type LanguagePreference } from "./i18n";

interface I18nContextType {
  language: string;
  languagePreference: LanguagePreference;
  setLanguage: (lang: LanguagePreference) => Promise<void>;
  isReady: boolean;
}

const I18nContext = createContext<I18nContextType>({
  language: "ko",
  languagePreference: "system",
  setLanguage: async () => {},
  isReady: false,
});

export const useLanguage = () => useContext(I18nContext);

interface I18nProviderProps {
  children: React.ReactNode;
}

export type { LanguagePreference } from "./i18n";

export function I18nProvider({ children }: I18nProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [language, setLanguageState] = useState<string>("ko");
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>("system");

  useEffect(() => {
    const init = async () => {
      await initI18n();
      const savedPref = await getSavedLanguagePreference();
      setLanguagePreference((savedPref as LanguagePreference) || "system");
      setLanguageState(getCurrentLanguage());
      setIsReady(true);
    };
    init();
  }, []);

  const setLanguage = async (lang: LanguagePreference) => {
    await changeLanguage(lang);
    setLanguagePreference(lang);
    setLanguageState(getCurrentLanguage());
  };

  if (!isReady) {
    return null;
  }

  return (
    <I18nContext.Provider value={{ language, languagePreference, setLanguage, isReady }}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}
