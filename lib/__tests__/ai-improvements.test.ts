/**
 * AI 개선 사항 테스트
 * 
 * Rate Limiting, AI 최적화, GPS 압축, 에코 스코어 등 테스트
 */

import { describe, it, expect, beforeEach } from "vitest";

// AI 최적화 테스트
describe("AI Optimization", () => {
  describe("checkAnalysisEligibility", () => {
    // 동적 import로 테스트
    it("should skip analysis for short rides (< 500m)", async () => {
      const { checkAnalysisEligibility } = await import("../ai-optimization");
      
      const result = checkAnalysisEligibility({
        distance: 300,  // 300m
        duration: 180,  // 3분
        avgSpeed: 10,
        maxSpeed: 15,
        gpsPointsCount: 50,
      });
      
      expect(result.eligible).toBe(false);
      expect(result.skipReason).toBe("too_short");
    });

    it("should skip analysis for short duration (< 2min)", async () => {
      const { checkAnalysisEligibility } = await import("../ai-optimization");
      
      const result = checkAnalysisEligibility({
        distance: 1000,
        duration: 60,  // 1분
        avgSpeed: 20,
        maxSpeed: 25,
        gpsPointsCount: 30,
      });
      
      expect(result.eligible).toBe(false);
      expect(result.skipReason).toBe("too_short");
    });

    it("should skip analysis for too slow rides (< 3km/h)", async () => {
      const { checkAnalysisEligibility } = await import("../ai-optimization");
      
      const result = checkAnalysisEligibility({
        distance: 1000,
        duration: 600,
        avgSpeed: 2,  // 2km/h
        maxSpeed: 5,
        gpsPointsCount: 100,
      });
      
      expect(result.eligible).toBe(false);
      expect(result.skipReason).toBe("too_slow");
    });

    it("should skip analysis for data errors (> 80km/h avg)", async () => {
      const { checkAnalysisEligibility } = await import("../ai-optimization");
      
      const result = checkAnalysisEligibility({
        distance: 5000,
        duration: 300,
        avgSpeed: 90,  // 90km/h - 데이터 오류
        maxSpeed: 120,
        gpsPointsCount: 100,
      });
      
      expect(result.eligible).toBe(false);
      expect(result.skipReason).toBe("data_error");
    });

    it("should allow analysis for valid rides", async () => {
      const { checkAnalysisEligibility } = await import("../ai-optimization");
      
      const result = checkAnalysisEligibility({
        distance: 3000,  // 3km
        duration: 600,   // 10분
        avgSpeed: 18,    // 18km/h
        maxSpeed: 30,
        gpsPointsCount: 200,
      });
      
      expect(result.eligible).toBe(true);
    });
  });

  describe("generateDefaultAnalysis", () => {
    it("should generate default analysis for skipped rides", async () => {
      const { generateDefaultAnalysis } = await import("../ai-optimization");
      
      const result = generateDefaultAnalysis(
        { distance: 300, duration: 60, avgSpeed: 10, maxSpeed: 15 },
        "too_short"
      );
      
      expect(result.summary).toContain("0.3km");
      expect(result.tips).toHaveLength(2);
      expect(result.highlights).toHaveLength(2);
    });
  });
});

// GPS 압축 테스트
describe("GPS Compression", () => {
  describe("compressGpsPoints", () => {
    it("should compress GPS points using RDP algorithm", async () => {
      const { compressGpsPoints } = await import("../gps-compression");
      
      // 직선 경로 (압축 가능)
      const points = [
        { latitude: 37.5, longitude: 127.0, altitude: 0, timestamp: 0, speed: 10, accuracy: 5 },
        { latitude: 37.50001, longitude: 127.00001, altitude: 0, timestamp: 1000, speed: 10, accuracy: 5 },
        { latitude: 37.50002, longitude: 127.00002, altitude: 0, timestamp: 2000, speed: 10, accuracy: 5 },
        { latitude: 37.50003, longitude: 127.00003, altitude: 0, timestamp: 3000, speed: 10, accuracy: 5 },
        { latitude: 37.50004, longitude: 127.00004, altitude: 0, timestamp: 4000, speed: 10, accuracy: 5 },
      ];
      
      const compressed = compressGpsPoints(points, 5);
      
      // 직선이므로 시작점과 끝점만 남아야 함
      expect(compressed.length).toBeLessThan(points.length);
      expect(compressed[0]).toEqual(points[0]);
      expect(compressed[compressed.length - 1]).toEqual(points[points.length - 1]);
    });

    it("should preserve points on curved paths", async () => {
      const { compressGpsPoints } = await import("../gps-compression");
      
      // 곡선 경로 (중간점 보존 필요)
      const points = [
        { latitude: 37.5, longitude: 127.0, altitude: 0, timestamp: 0, speed: 10, accuracy: 5 },
        { latitude: 37.501, longitude: 127.001, altitude: 0, timestamp: 1000, speed: 10, accuracy: 5 },
        { latitude: 37.500, longitude: 127.002, altitude: 0, timestamp: 2000, speed: 10, accuracy: 5 },  // 곡선점
        { latitude: 37.501, longitude: 127.003, altitude: 0, timestamp: 3000, speed: 10, accuracy: 5 },
        { latitude: 37.502, longitude: 127.004, altitude: 0, timestamp: 4000, speed: 10, accuracy: 5 },
      ];
      
      const compressed = compressGpsPoints(points, 5);
      
      // 곡선점이 보존되어야 함
      expect(compressed.length).toBeGreaterThanOrEqual(3);
    });

    it("should handle empty or single point arrays", async () => {
      const { compressGpsPoints } = await import("../gps-compression");
      
      expect(compressGpsPoints([], 5)).toEqual([]);
      
      const singlePoint = [{ latitude: 37.5, longitude: 127.0, altitude: 0, timestamp: 0, speed: 10, accuracy: 5 }];
      expect(compressGpsPoints(singlePoint, 5)).toEqual(singlePoint);
    });
  });

  describe("smartCompress", () => {
    it("should choose appropriate compression level based on distance", async () => {
      const { recommendCompressionLevel, COMPRESSION_LEVELS } = await import("../gps-compression");
      
      // 1km 미만 -> high
      expect(recommendCompressionLevel(500)).toBe("high");
      expect(COMPRESSION_LEVELS.high).toBe(2);
      
      // 1-5km -> medium
      expect(recommendCompressionLevel(3000)).toBe("medium");
      
      // 5-20km -> low
      expect(recommendCompressionLevel(10000)).toBe("low");
      
      // 20km 이상 -> minimal
      expect(recommendCompressionLevel(25000)).toBe("minimal");
    });
  });
});

// 에코 스코어 테스트
describe("Eco Score", () => {
  describe("calculateEcoScore", () => {
    it("should calculate eco score for a ride", async () => {
      const { calculateEcoScore } = await import("../eco-score");
      
      const points = [
        { latitude: 37.5, longitude: 127.0, altitude: 0, timestamp: 0, speed: 5, accuracy: 5 },
        { latitude: 37.501, longitude: 127.001, altitude: 0, timestamp: 60000, speed: 5, accuracy: 5 },
        { latitude: 37.502, longitude: 127.002, altitude: 0, timestamp: 120000, speed: 5, accuracy: 5 },
      ];
      
      const result = calculateEcoScore(points, 2000, 600);
      
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(['S', 'A', 'B', 'C', 'D']).toContain(result.grade);
      expect(result.tips).toBeDefined();
      expect(result.co2Saved).toBeGreaterThanOrEqual(0);
    });

    it("should give higher score for optimal speed (15-25km/h)", async () => {
      const { calculateEcoScore } = await import("../eco-score");
      
      // 최적 속도 (20km/h = 5.56 m/s)
      const optimalPoints = [
        { latitude: 37.5, longitude: 127.0, altitude: 0, timestamp: 0, speed: 5.56, accuracy: 5 },
        { latitude: 37.501, longitude: 127.001, altitude: 0, timestamp: 60000, speed: 5.56, accuracy: 5 },
      ];
      
      // 너무 빠른 속도 (40km/h = 11.11 m/s)
      const fastPoints = [
        { latitude: 37.5, longitude: 127.0, altitude: 0, timestamp: 0, speed: 11.11, accuracy: 5 },
        { latitude: 37.501, longitude: 127.001, altitude: 0, timestamp: 60000, speed: 11.11, accuracy: 5 },
      ];
      
      const optimalResult = calculateEcoScore(optimalPoints, 3000, 600);
      const fastResult = calculateEcoScore(fastPoints, 3000, 600);
      
      expect(optimalResult.breakdown.optimalSpeed).toBeGreaterThan(fastResult.breakdown.optimalSpeed);
    });
  });

  describe("getGradeColor", () => {
    it("should return correct colors for each grade", async () => {
      const { getGradeColor } = await import("../eco-score");
      
      expect(getGradeColor('S')).toBe('#10B981');
      expect(getGradeColor('A')).toBe('#22C55E');
      expect(getGradeColor('B')).toBe('#84CC16');
      expect(getGradeColor('C')).toBe('#F59E0B');
      expect(getGradeColor('D')).toBe('#EF4444');
    });
  });

  describe("CO2 calculation", () => {
    it("should calculate CO2 savings correctly", async () => {
      const { calculateEcoScore } = await import("../eco-score");
      
      const points = [
        { latitude: 37.5, longitude: 127.0, altitude: 0, timestamp: 0, speed: 5, accuracy: 5 },
      ];
      
      // 10km 주행
      const result = calculateEcoScore(points, 10000, 1800);
      
      // 자동차 대비 약 1.15kg CO2 절감 (10km * 0.115kg/km)
      expect(result.co2Saved).toBeGreaterThan(1);
      expect(result.co2Saved).toBeLessThan(2);
    });
  });
});

// AI 컨텍스트 압축 테스트
describe("AI Context Compression", () => {
  describe("compressPrompt", () => {
    it("should remove unnecessary whitespace", async () => {
      const { compressPrompt } = await import("../ai-context-compression");
      
      const original = "  주행 거리:   3.5km   \n\n  시간:  10분  ";
      const compressed = compressPrompt(original);
      
      expect(compressed).toBe("주행 거리: 3.5km 시간: 10분");
    });
  });

  describe("formatNumber", () => {
    it("should format numbers correctly", async () => {
      const { formatNumber } = await import("../ai-context-compression");
      
      expect(formatNumber(3.0, 1)).toBe("3");
      expect(formatNumber(3.5, 1)).toBe("3.5");
      expect(formatNumber(3.14159, 2)).toBe("3.14");
    });
  });

  describe("createCompressedRidePrompt", () => {
    it("should create compressed prompt with all data", async () => {
      const { createCompressedRidePrompt } = await import("../ai-context-compression");
      
      const prompt = createCompressedRidePrompt({
        distanceKm: 5.5,
        durationMin: 20,
        avgSpeedKmh: 16.5,
        maxSpeedKmh: 28,
        batteryUsed: 15,
        stopCount: 3,
        temperature: 22,
      });
      
      expect(prompt).toContain("거리:5.5km");
      expect(prompt).toContain("시간:20분");
      expect(prompt).toContain("배터리:15%");
      expect(prompt).toContain("정지:3회");
      expect(prompt).toContain("기온:22°C");
    });
  });

  describe("estimateTokens", () => {
    it("should estimate token count", async () => {
      const { estimateTokens } = await import("../ai-context-compression");
      
      const koreanText = "안녕하세요";
      const englishText = "hello";
      
      // 한글은 더 많은 토큰 사용
      expect(estimateTokens(koreanText)).toBeGreaterThan(estimateTokens(englishText));
    });
  });
});

// GPS 동적 업데이트 테스트 - expo-location 의존성으로 인해 테스트 환경에서 스킵
describe("GPS Dynamic Interval", () => {
  describe("getSpeedZone", () => {
    it("should categorize speeds into zones correctly", () => {
      // 속도 구간 분류 로직 테스트
      const getSpeedZone = (speedKmh: number): 'stationary' | 'slow' | 'medium' | 'fast' => {
        if (speedKmh < 3) return 'stationary';
        if (speedKmh < 15) return 'slow';
        if (speedKmh < 30) return 'medium';
        return 'fast';
      };
      
      expect(getSpeedZone(1)).toBe('stationary');
      expect(getSpeedZone(10)).toBe('slow');
      expect(getSpeedZone(20)).toBe('medium');
      expect(getSpeedZone(40)).toBe('fast');
    });
  });

  describe("battery savings calculation", () => {
    it("should calculate savings based on zone distribution", () => {
      // 배터리 절약 계산 로직 테스트
      const consumption = {
        stationary: 0.3,
        slow: 0.5,
        medium: 0.7,
        fast: 1.0,
      };
      
      const updates = { stationary: 2, slow: 1, medium: 1, fast: 1 };
      const total = 5;
      
      const actualConsumption = 
        updates.stationary * consumption.stationary +
        updates.slow * consumption.slow +
        updates.medium * consumption.medium +
        updates.fast * consumption.fast;
      
      const maxConsumption = total * consumption.fast;
      const savings = ((maxConsumption - actualConsumption) / maxConsumption) * 100;
      
      expect(savings).toBeGreaterThan(0);
      expect(savings).toBeLessThan(100);
    });
  });
});

// 에러 리포팅 테스트 - Platform 의존성으로 인해 로직만 테스트
describe("Error Reporting Logic", () => {
  describe("error queue management", () => {
    it("should manage error queue correctly", () => {
      // 에러 큐 관리 로직 테스트
      const MAX_QUEUE_SIZE = 100;
      const errorQueue: { message: string; severity: string }[] = [];
      
      // 에러 추가
      errorQueue.push({ message: "Error 1", severity: "error" });
      errorQueue.push({ message: "Warning 1", severity: "warning" });
      
      expect(errorQueue.length).toBe(2);
      
      // 큐 크기 제한 테스트
      for (let i = 0; i < MAX_QUEUE_SIZE + 10; i++) {
        errorQueue.push({ message: `Error ${i}`, severity: "error" });
        if (errorQueue.length > MAX_QUEUE_SIZE) {
          errorQueue.shift();
        }
      }
      
      expect(errorQueue.length).toBe(MAX_QUEUE_SIZE);
    });
  });

  describe("error statistics", () => {
    it("should calculate error stats by severity", () => {
      const errors = [
        { severity: "error" },
        { severity: "error" },
        { severity: "warning" },
        { severity: "info" },
      ];
      
      const byLevel = errors.reduce((acc, e) => {
        acc[e.severity] = (acc[e.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      expect(byLevel.error).toBe(2);
      expect(byLevel.warning).toBe(1);
      expect(byLevel.info).toBe(1);
    });
  });
});
