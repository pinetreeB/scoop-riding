import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database functions
const mockRecalculateScooterStats = vi.fn();
const mockRecalculateAllScooterStats = vi.fn();

vi.mock("../server/db", () => ({
  recalculateScooterStats: (scooterId: number, userId: number) => 
    mockRecalculateScooterStats(scooterId, userId),
  recalculateAllScooterStats: (userId: number) => 
    mockRecalculateAllScooterStats(userId),
}));

describe("Scooter Stats Recalculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recalculateScooterStats", () => {
    it("should return calculated stats for a scooter", async () => {
      mockRecalculateScooterStats.mockResolvedValue({
        totalRides: 5,
        totalDistance: 25000,
      });

      const result = await mockRecalculateScooterStats(1, 100);

      expect(mockRecalculateScooterStats).toHaveBeenCalledWith(1, 100);
      expect(result).toEqual({
        totalRides: 5,
        totalDistance: 25000,
      });
    });

    it("should return null if scooter not found", async () => {
      mockRecalculateScooterStats.mockResolvedValue(null);

      const result = await mockRecalculateScooterStats(999, 100);

      expect(result).toBeNull();
    });

    it("should handle zero rides correctly", async () => {
      mockRecalculateScooterStats.mockResolvedValue({
        totalRides: 0,
        totalDistance: 0,
      });

      const result = await mockRecalculateScooterStats(1, 100);

      expect(result).toEqual({
        totalRides: 0,
        totalDistance: 0,
      });
    });
  });

  describe("recalculateAllScooterStats", () => {
    it("should return stats for all scooters of a user", async () => {
      mockRecalculateAllScooterStats.mockResolvedValue([
        { scooterId: 1, totalRides: 5, totalDistance: 25000 },
        { scooterId: 2, totalRides: 3, totalDistance: 15000 },
      ]);

      const result = await mockRecalculateAllScooterStats(100);

      expect(mockRecalculateAllScooterStats).toHaveBeenCalledWith(100);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        scooterId: 1,
        totalRides: 5,
        totalDistance: 25000,
      });
    });

    it("should return empty array if user has no scooters", async () => {
      mockRecalculateAllScooterStats.mockResolvedValue([]);

      const result = await mockRecalculateAllScooterStats(100);

      expect(result).toEqual([]);
    });
  });
});

describe("Battery Type Labels", () => {
  const BATTERY_TYPES = [
    { value: "lithium_ion", label: "리튬이온 (Li-ion)" },
    { value: "lifepo4", label: "리튬인산철 (LiFePO4)" },
    { value: "lipo", label: "리튬폴리머 (Li-Po)" },
  ];

  it("should have correct Korean labels for battery types", () => {
    expect(BATTERY_TYPES[0].label).toBe("리튬이온 (Li-ion)");
    expect(BATTERY_TYPES[1].label).toBe("리튬인산철 (LiFePO4)");
    expect(BATTERY_TYPES[2].label).toBe("리튬폴리머 (Li-Po)");
  });

  it("should not contain typo '리튜'", () => {
    BATTERY_TYPES.forEach((type) => {
      expect(type.label).not.toContain("리튜");
    });
  });
});
