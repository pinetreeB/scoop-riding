import { describe, it, expect } from "vitest";

describe("Profile Color Feature", () => {
  // Available profile colors
  const PROFILE_COLORS = [
    { name: "오렌지", color: "#FF6B00" },
    { name: "블루", color: "#2196F3" },
    { name: "그린", color: "#4CAF50" },
    { name: "퍼플", color: "#9C27B0" },
    { name: "레드", color: "#F44336" },
    { name: "핑크", color: "#E91E63" },
    { name: "시안", color: "#00BCD4" },
    { name: "옆로우", color: "#FFEB3B" },
    { name: "그레이", color: "#607D8B" },
    { name: "네이비", color: "#3F51B5" },
  ];

  it("should have 10 profile colors available", () => {
    expect(PROFILE_COLORS).toHaveLength(10);
  });

  it("should have valid hex color codes", () => {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    PROFILE_COLORS.forEach((item) => {
      expect(item.color).toMatch(hexColorRegex);
    });
  });

  it("should have unique color codes", () => {
    const colorCodes = PROFILE_COLORS.map((item) => item.color);
    const uniqueColorCodes = new Set(colorCodes);
    expect(uniqueColorCodes.size).toBe(colorCodes.length);
  });

  it("should have default orange color as first option", () => {
    expect(PROFILE_COLORS[0].color).toBe("#FF6B00");
  });
});
