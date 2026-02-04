import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, NativeModules } from "react-native";

import ko from "@/locales/ko.json";
import en from "@/locales/en.json";

const LANGUAGE_KEY = "app_language";

// Get device language
const getDeviceLanguage = (): string => {
  let deviceLanguage = "ko";
  
  if (Platform.OS === "ios") {
    deviceLanguage =
      NativeModules.SettingsManager?.settings?.AppleLocale ||
      NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
      "ko";
  } else if (Platform.OS === "android") {
    deviceLanguage = NativeModules.I18nManager?.localeIdentifier || "ko";
  } else if (Platform.OS === "web") {
    deviceLanguage = navigator?.language || "ko";
  }
  
  // Extract language code (e.g., "ko-KR" -> "ko")
  return deviceLanguage.split("-")[0].split("_")[0];
};

// Initialize i18n
const initI18n = async () => {
  // Try to get saved language preference
  let savedLanguage: string | null = null;
  try {
    savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch (error) {
    console.log("Error reading language preference:", error);
  }

  const deviceLanguage = getDeviceLanguage();
  const defaultLanguage = savedLanguage || (deviceLanguage === "en" ? "en" : "ko");

  await i18n.use(initReactI18next).init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
    },
    lng: defaultLanguage,
    fallbackLng: "ko",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

  return i18n;
};

// Change language and save preference
export const changeLanguage = async (language: "ko" | "en" | "system") => {
  try {
    if (language === "system") {
      await AsyncStorage.removeItem(LANGUAGE_KEY);
      const deviceLanguage = getDeviceLanguage();
      const targetLanguage = deviceLanguage === "en" ? "en" : "ko";
      await i18n.changeLanguage(targetLanguage);
    } else {
      await AsyncStorage.setItem(LANGUAGE_KEY, language);
      await i18n.changeLanguage(language);
    }
  } catch (error) {
    console.error("Error changing language:", error);
  }
};

// Get current language
export const getCurrentLanguage = (): string => {
  return i18n.language || "ko";
};

// Get saved language preference (null means system default)
export const getSavedLanguagePreference = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch (error) {
    console.error("Error getting language preference:", error);
    return null;
  }
};

// Export types for language
export type SupportedLanguage = "ko" | "en";
export type LanguagePreference = "ko" | "en" | "system";

export { initI18n };
export default i18n;
