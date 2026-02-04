import { describe, it, expect } from "vitest";
import koTranslations from "../locales/ko.json";
import enTranslations from "../locales/en.json";

describe("i18n translations", () => {
  it("should have Korean translations", () => {
    expect(koTranslations).toBeDefined();
    expect(koTranslations.tabs).toBeDefined();
    expect(koTranslations.tabs.home).toBe("홈");
    expect(koTranslations.tabs.history).toBe("기록");
    expect(koTranslations.tabs.community).toBe("커뮤니티");
    expect(koTranslations.tabs.aiHelper).toBe("AI 도우미");
    expect(koTranslations.tabs.settings).toBe("설정");
  });

  it("should have English translations", () => {
    expect(enTranslations).toBeDefined();
    expect(enTranslations.tabs).toBeDefined();
    expect(enTranslations.tabs.home).toBe("Home");
    expect(enTranslations.tabs.history).toBe("History");
    expect(enTranslations.tabs.community).toBe("Community");
    expect(enTranslations.tabs.aiHelper).toBe("AI Helper");
    expect(enTranslations.tabs.settings).toBe("Settings");
  });

  it("should have matching translation keys", () => {
    const koKeys = Object.keys(koTranslations);
    const enKeys = Object.keys(enTranslations);
    
    // Both should have the same top-level keys
    expect(koKeys.sort()).toEqual(enKeys.sort());
  });

  it("should have settings translations", () => {
    expect(koTranslations.settings).toBeDefined();
    expect(enTranslations.settings).toBeDefined();
    
    expect(koTranslations.settings.language.title).toBe("언어");
    expect(enTranslations.settings.language.title).toBe("Language");
  });

  it("should have common translations", () => {
    expect(koTranslations.common).toBeDefined();
    expect(enTranslations.common).toBeDefined();
    
    expect(koTranslations.common.save).toBe("저장");
    expect(enTranslations.common.save).toBe("Save");
    
    expect(koTranslations.common.cancel).toBe("취소");
    expect(enTranslations.common.cancel).toBe("Cancel");
  });
});
