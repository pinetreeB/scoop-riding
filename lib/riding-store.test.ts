import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  formatDuration,
  formatDistance,
  formatSpeed,
  generateId,
} from "./riding-store";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

describe("riding-store utilities", () => {
  describe("formatDuration", () => {
    it("should format 0 seconds correctly", () => {
      expect(formatDuration(0)).toBe("00:00:00");
    });

    it("should format seconds only", () => {
      expect(formatDuration(45)).toBe("00:00:45");
    });

    it("should format minutes and seconds", () => {
      expect(formatDuration(125)).toBe("00:02:05");
    });

    it("should format hours, minutes, and seconds", () => {
      expect(formatDuration(3725)).toBe("01:02:05");
    });

    it("should handle large durations", () => {
      expect(formatDuration(36000)).toBe("10:00:00");
    });
  });

  describe("formatDistance", () => {
    it("should format meters under 1000", () => {
      expect(formatDistance(500)).toBe("500 m");
    });

    it("should format exactly 1000 meters as km", () => {
      expect(formatDistance(1000)).toBe("1.00 km");
    });

    it("should format kilometers with 2 decimal places", () => {
      expect(formatDistance(2500)).toBe("2.50 km");
    });

    it("should format large distances", () => {
      expect(formatDistance(15750)).toBe("15.75 km");
    });
  });

  describe("formatSpeed", () => {
    it("should format speed with 1 decimal place", () => {
      expect(formatSpeed(15.5)).toBe("15.5 km/h");
    });

    it("should format zero speed", () => {
      expect(formatSpeed(0)).toBe("0.0 km/h");
    });

    it("should round speed correctly", () => {
      expect(formatSpeed(25.678)).toBe("25.7 km/h");
    });
  });

  describe("generateId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it("should generate non-empty strings", () => {
      const id = generateId();
      expect(id.length).toBeGreaterThan(0);
    });
  });
});
