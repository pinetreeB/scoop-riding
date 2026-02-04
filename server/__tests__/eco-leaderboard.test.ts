import { describe, it, expect } from "vitest";

// Eco score calculation logic tests
describe("Eco Leaderboard", () => {
  describe("calculateEcoScoreFromRide", () => {
    // Inline implementation for testing
    function calculateEcoScoreFromRide(
      avgSpeed: number,
      maxSpeed: number,
      distance: number,
      duration: number
    ): { score: number; co2Saved: number } {
      // Optimal speed score (15-25km/h is optimal)
      let speedScore = 100;
      if (avgSpeed < 15) {
        speedScore = Math.max(0, (avgSpeed / 15) * 100);
      } else if (avgSpeed > 25) {
        speedScore = Math.max(0, 100 - ((avgSpeed - 25) * 6.67));
      }
      
      // Max speed penalty (over 40km/h reduces score)
      const maxSpeedPenalty = maxSpeed > 40 ? Math.min(30, (maxSpeed - 40) * 1.5) : 0;
      
      // Distance bonus (longer rides are more efficient)
      const distanceKm = distance / 1000;
      const distanceBonus = Math.min(20, distanceKm * 4);
      
      // Calculate final score
      const score = Math.max(0, Math.min(100, speedScore - maxSpeedPenalty + distanceBonus));
      
      // CO2 saved (car emits ~120g/km, scooter ~5g/km)
      const co2Saved = distanceKm * 0.115; // kg
      
      return { score: Math.round(score), co2Saved };
    }

    it("should give high score for optimal speed (15-25 km/h)", () => {
      const result = calculateEcoScoreFromRide(20, 25, 5000, 900);
      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    it("should give lower score for slow speed", () => {
      const result = calculateEcoScoreFromRide(5, 10, 1000, 600);
      expect(result.score).toBeLessThan(50);
    });

    it("should penalize high max speed", () => {
      // 더 낮은 기본 점수로 테스트 (100점 상한 회피)
      const normalResult = calculateEcoScoreFromRide(12, 30, 2000, 600);
      const fastResult = calculateEcoScoreFromRide(12, 50, 2000, 600);
      expect(fastResult.score).toBeLessThan(normalResult.score);
    });

    it("should give distance bonus", () => {
      // 더 낮은 기본 점수로 테스트 (100점 상한 회피)
      const shortResult = calculateEcoScoreFromRide(10, 15, 500, 180);
      const longResult = calculateEcoScoreFromRide(10, 15, 5000, 1800);
      expect(longResult.score).toBeGreaterThan(shortResult.score);
    });

    it("should calculate CO2 saved correctly", () => {
      const result = calculateEcoScoreFromRide(20, 25, 10000, 1800); // 10km
      expect(result.co2Saved).toBeCloseTo(1.15, 1); // 10km * 0.115 kg/km
    });
  });

  describe("getGradeFromScore", () => {
    function getGradeFromScore(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
      if (score >= 90) return 'S';
      if (score >= 75) return 'A';
      if (score >= 60) return 'B';
      if (score >= 40) return 'C';
      return 'D';
    }

    it("should return S for score >= 90", () => {
      expect(getGradeFromScore(95)).toBe('S');
      expect(getGradeFromScore(90)).toBe('S');
    });

    it("should return A for score 75-89", () => {
      expect(getGradeFromScore(89)).toBe('A');
      expect(getGradeFromScore(75)).toBe('A');
    });

    it("should return B for score 60-74", () => {
      expect(getGradeFromScore(74)).toBe('B');
      expect(getGradeFromScore(60)).toBe('B');
    });

    it("should return C for score 40-59", () => {
      expect(getGradeFromScore(59)).toBe('C');
      expect(getGradeFromScore(40)).toBe('C');
    });

    it("should return D for score < 40", () => {
      expect(getGradeFromScore(39)).toBe('D');
      expect(getGradeFromScore(0)).toBe('D');
    });
  });
});
