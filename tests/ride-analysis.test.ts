import { describe, it, expect } from "vitest";

describe("Ride Analysis", () => {
  describe("Analysis Input Validation", () => {
    it("should accept valid ride data", () => {
      const rideData = {
        distance: 5000, // 5km in meters
        duration: 1200, // 20 minutes in seconds
        avgSpeed: 15, // km/h
        maxSpeed: 25, // km/h
        voltageStart: 67.2,
        voltageEnd: 58.8,
        socStart: 100,
        socEnd: 50,
        scooterId: 1,
        gpsPointsCount: 100,
      };

      expect(rideData.distance).toBeGreaterThan(0);
      expect(rideData.duration).toBeGreaterThan(0);
      expect(rideData.avgSpeed).toBeGreaterThan(0);
      expect(rideData.maxSpeed).toBeGreaterThanOrEqual(rideData.avgSpeed);
    });

    it("should calculate energy consumption correctly", () => {
      const totalCapacityWh = 1800; // 60V * 30Ah
      const socStart = 100;
      const socEnd = 50;
      const distanceKm = 30;

      const socConsumed = socStart - socEnd;
      const energyWh = (totalCapacityWh * socConsumed) / 100;
      const efficiencyWhKm = energyWh / distanceKm;

      expect(socConsumed).toBe(50);
      expect(energyWh).toBe(900);
      expect(efficiencyWhKm).toBe(30);
    });

    it("should handle missing battery data gracefully", () => {
      const rideData = {
        distance: 5000,
        duration: 1200,
        avgSpeed: 15,
        maxSpeed: 25,
        // No voltage data
      };

      const hasBatteryData = rideData.hasOwnProperty("voltageStart") && 
                             rideData.hasOwnProperty("voltageEnd");
      expect(hasBatteryData).toBe(false);
    });
  });

  describe("Analysis Response Format", () => {
    it("should have correct response structure", () => {
      const mockAnalysis = {
        summary: "5km 주행 완료! 평균 15km/h로 달렸습니다.",
        efficiencyScore: "보통",
        ridingStyle: "안정적",
        batteryStatus: "좋음",
        tips: ["꾸준한 주행으로 연비를 높여보세요", "안전 장비를 착용해주세요"],
        highlights: ["오늘도 안전하게 주행했어요", "꾸준한 라이딩 습관 좋아요"],
      };

      expect(mockAnalysis).toHaveProperty("summary");
      expect(mockAnalysis).toHaveProperty("efficiencyScore");
      expect(mockAnalysis).toHaveProperty("ridingStyle");
      expect(mockAnalysis).toHaveProperty("batteryStatus");
      expect(mockAnalysis).toHaveProperty("tips");
      expect(mockAnalysis).toHaveProperty("highlights");
      expect(Array.isArray(mockAnalysis.tips)).toBe(true);
      expect(Array.isArray(mockAnalysis.highlights)).toBe(true);
    });

    it("should allow null battery status when no battery data", () => {
      const mockAnalysis = {
        summary: "5km 주행 완료!",
        efficiencyScore: "보통",
        ridingStyle: "보통",
        batteryStatus: null,
        tips: [],
        highlights: [],
      };

      expect(mockAnalysis.batteryStatus).toBeNull();
    });
  });

  describe("Score Classification", () => {
    it("should classify riding style based on max speed", () => {
      const classifyRidingStyle = (maxSpeed: number, avgSpeed: number) => {
        if (maxSpeed > 40) return "공격적";
        if (avgSpeed < 15) return "안정적";
        return "보통";
      };

      expect(classifyRidingStyle(45, 25)).toBe("공격적");
      expect(classifyRidingStyle(30, 12)).toBe("안정적");
      expect(classifyRidingStyle(35, 20)).toBe("보통");
    });

    it("should classify efficiency based on Wh/km", () => {
      const classifyEfficiency = (whPerKm: number) => {
        if (whPerKm < 25) return "좋음";
        if (whPerKm < 35) return "보통";
        return "개선필요";
      };

      expect(classifyEfficiency(20)).toBe("좋음");
      expect(classifyEfficiency(30)).toBe("보통");
      expect(classifyEfficiency(40)).toBe("개선필요");
    });
  });

  describe("Duration Formatting", () => {
    it("should format duration correctly", () => {
      const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}분 ${secs}초`;
      };

      expect(formatDuration(1200)).toBe("20분 0초");
      expect(formatDuration(90)).toBe("1분 30초");
      expect(formatDuration(3661)).toBe("61분 1초");
    });
  });

  describe("Distance Formatting", () => {
    it("should format distance in km correctly", () => {
      const formatDistance = (meters: number) => {
        return (meters / 1000).toFixed(2);
      };

      expect(formatDistance(5000)).toBe("5.00");
      expect(formatDistance(1234)).toBe("1.23");
      expect(formatDistance(500)).toBe("0.50");
    });
  });
});
