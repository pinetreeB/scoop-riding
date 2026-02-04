import { useTranslation as useI18nTranslation } from "react-i18next";

/**
 * Custom hook for translations
 * Wraps react-i18next's useTranslation for easier usage
 * 
 * Usage:
 * const { t } = useTranslation();
 * <Text>{t('common.loading')}</Text>
 */
export function useTranslation() {
  const { t, i18n } = useI18nTranslation();
  
  return {
    t,
    i18n,
    language: i18n.language,
    isKorean: i18n.language === "ko",
    isEnglish: i18n.language === "en",
  };
}

export default useTranslation;
