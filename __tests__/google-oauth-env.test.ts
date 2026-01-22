import { describe, it, expect } from "vitest";

describe("Google OAuth Environment Variables", () => {
  it("should have EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID set", () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(webClientId).toBeDefined();
    expect(webClientId).not.toBe("");
    expect(webClientId).toMatch(/\.apps\.googleusercontent\.com$/);
  });

  it("should have EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID set", () => {
    const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
    expect(androidClientId).toBeDefined();
    expect(androidClientId).not.toBe("");
    expect(androidClientId).toMatch(/\.apps\.googleusercontent\.com$/);
  });

  it("web and android client IDs should be different", () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
    expect(webClientId).not.toBe(androidClientId);
  });
});
