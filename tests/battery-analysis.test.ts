import { describe, it, expect } from "vitest";
import {
  calculateSoc,
  calculateEnergyConsumed,
  calculateEfficiency,
  estimateBatteryCycles,
  estimateBatteryHealth,
  createBatterySpec,
  estimateRange,
  estimateArrivalSoc,
  BatterySpec,
} from "../lib/battery-analysis";

describe("Battery Analysis Utilities", () => {
  // 테스트용 배터리 스펙
  const lithiumIonSpec = createBatterySpec(60, 30, "li-ion");
  const lifePo4Spec = createBatterySpec(60, 30, "lfp");

  describe("createBatterySpec", () => {
    it("should create lithium-ion battery spec correctly", () => {
      const spec = createBatterySpec(60, 30, "li-ion");
      expect(spec.nominalVoltage).toBe(60);
      expect(spec.capacity).toBe(30);
      expect(spec.cellCount).toBe(16); // 60V / 3.7V ≈ 16
      expect(spec.fullVoltage).toBeCloseTo(67.2, 1); // 4.2V * 16
      expect(spec.emptyVoltage).toBeCloseTo(48, 1); // 3.0V * 16
      expect(spec.type).toBe("li-ion");
    });

    it("should create LiFePO4 battery spec correctly", () => {
      const spec = createBatterySpec(60, 30, "lfp");
      expect(spec.cellCount).toBe(19); // 60V / 3.2V ≈ 19
      expect(spec.fullVoltage).toBeCloseTo(69.35, 1); // 3.65V * 19
      expect(spec.emptyVoltage).toBeCloseTo(47.5, 1); // 2.5V * 19
    });
  });

  describe("calculateSoc", () => {
    it("should return 100% for fully charged battery", () => {
      const soc = calculateSoc(67.2, lithiumIonSpec);
      expect(soc).toBe(100);
    });

    it("should return 0% for empty battery", () => {
      const soc = calculateSoc(48, lithiumIonSpec);
      expect(soc).toBe(0);
    });

    it("should return ~50% for mid-range voltage", () => {
      // Mid voltage: (67.2 + 48) / 2 = 57.6V
      const soc = calculateSoc(57.6, lithiumIonSpec);
      expect(soc).toBe(50);
    });

    it("should clamp SOC to 100 for over-voltage", () => {
      const soc = calculateSoc(80, lithiumIonSpec);
      expect(soc).toBe(100);
    });

    it("should clamp SOC to 0 for under-voltage", () => {
      const soc = calculateSoc(30, lithiumIonSpec);
      expect(soc).toBe(0);
    });
  });

  describe("calculateEnergyConsumed", () => {
    it("should calculate energy consumed correctly", () => {
      // 67.2V to 57.6V (100% to 50%) = 900Wh consumed
      const energy = calculateEnergyConsumed(67.2, 57.6, lithiumIonSpec);
      expect(energy).toBe(900);
    });

    it("should return 0 for no change in voltage", () => {
      const energy = calculateEnergyConsumed(60, 60, lithiumIonSpec);
      expect(energy).toBe(0);
    });

    it("should handle partial discharge", () => {
      // 80% to 60% = 20% of 1800Wh = 360Wh
      const startVoltage = 48 + (67.2 - 48) * 0.8; // 63.36V
      const endVoltage = 48 + (67.2 - 48) * 0.6; // 59.52V
      const energy = calculateEnergyConsumed(startVoltage, endVoltage, lithiumIonSpec);
      expect(energy).toBeCloseTo(360, 0);
    });
  });

  describe("calculateEfficiency", () => {
    it("should calculate efficiency in Wh/km", () => {
      // 900Wh consumed, 30km traveled = 30 Wh/km
      const efficiency = calculateEfficiency(900, 30000);
      expect(efficiency).toBe(30);
    });

    it("should return 0 for zero distance", () => {
      const efficiency = calculateEfficiency(100, 0);
      expect(efficiency).toBe(0);
    });

    it("should handle small distances", () => {
      // 100Wh consumed, 5km traveled = 20 Wh/km
      const efficiency = calculateEfficiency(100, 5000);
      expect(efficiency).toBe(20);
    });
  });

  describe("estimateBatteryCycles", () => {
    it("should estimate cycles based on total distance and efficiency", () => {
      // 60V 30Ah = 1800Wh capacity
      // 30000km at 30 Wh/km = 900000Wh total
      // 900000 / (1800 * 0.5) = 1000 cycles
      const cycles = estimateBatteryCycles(30000000, 30, lithiumIonSpec);
      expect(cycles).toBeCloseTo(1000, 0);
    });

    it("should return 0 for zero efficiency", () => {
      const cycles = estimateBatteryCycles(10000, 0, lithiumIonSpec);
      expect(cycles).toBe(0);
    });
  });

  describe("estimateBatteryHealth", () => {
    it("should return 100% for new battery", () => {
      const health = estimateBatteryHealth(0, "li-ion");
      expect(health).toBe(100);
    });

    it("should decrease health with cycles", () => {
      const health = estimateBatteryHealth(250, "li-ion");
      // 250/500 * 20 = 10% degradation -> 90% health
      expect(health).toBe(90);
    });

    it("should not go below 80% at max cycles", () => {
      const health = estimateBatteryHealth(500, "li-ion");
      expect(health).toBe(80);
    });

    it("should handle LiFePO4 longer lifespan", () => {
      // LiFePO4 has 2000 cycle lifespan
      const health = estimateBatteryHealth(500, "lfp");
      // 500/2000 * 20 = 5% degradation -> 95% health
      expect(health).toBe(95);
    });
  });

  describe("estimateRange", () => {
    it("should estimate range based on current voltage and efficiency", () => {
      // 100% SOC, 1800Wh capacity, 30 Wh/km efficiency = 60km range
      const range = estimateRange(67.2, 30, lithiumIonSpec);
      expect(range).toBeCloseTo(60, 0);
    });

    it("should return 0 for zero efficiency", () => {
      const range = estimateRange(60, 0, lithiumIonSpec);
      expect(range).toBe(0);
    });

    it("should decrease range with lower voltage", () => {
      // 50% SOC = 900Wh remaining, 30 Wh/km = 30km range
      const range = estimateRange(57.6, 30, lithiumIonSpec);
      expect(range).toBeCloseTo(30, 0);
    });
  });

  describe("estimateArrivalSoc", () => {
    it("should estimate arrival SOC correctly", () => {
      // 100% SOC, 30km trip at 30 Wh/km = 900Wh needed
      // 900Wh / 1800Wh = 50% SOC used -> 50% remaining
      const arrivalSoc = estimateArrivalSoc(67.2, 30, 30, lithiumIonSpec);
      expect(arrivalSoc).toBeCloseTo(50, 0);
    });

    it("should return 0 if trip exceeds battery capacity", () => {
      // 100km trip at 30 Wh/km = 3000Wh needed > 1800Wh capacity
      const arrivalSoc = estimateArrivalSoc(67.2, 100, 30, lithiumIonSpec);
      expect(arrivalSoc).toBe(0);
    });
  });
});
