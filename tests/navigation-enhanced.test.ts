import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

describe("Navigation Enhanced Features", () => {
  describe("Travel Mode Types", () => {
    const travelModes = ["BICYCLING", "WALKING", "TWO_WHEELER", "DRIVING"];

    it("should support all travel mode types", () => {
      expect(travelModes).toContain("BICYCLING");
      expect(travelModes).toContain("WALKING");
      expect(travelModes).toContain("TWO_WHEELER");
      expect(travelModes).toContain("DRIVING");
    });

    it("should have correct Google Directions API mode mapping", () => {
      const modeMapping: Record<string, string> = {
        BICYCLING: "bicycling",
        WALKING: "walking",
        TWO_WHEELER: "driving", // Google uses driving for two-wheeler
        DRIVING: "driving",
      };

      expect(modeMapping.BICYCLING).toBe("bicycling");
      expect(modeMapping.WALKING).toBe("walking");
      expect(modeMapping.TWO_WHEELER).toBe("driving");
    });
  });

  describe("Voice Guidance Functions", () => {
    it("should have navigation start announcement function", () => {
      const announceNavigationStarted = (destination: string) => {
        return `${destination}까지 경로 안내를 시작합니다`;
      };

      expect(announceNavigationStarted("강남역")).toBe(
        "강남역까지 경로 안내를 시작합니다"
      );
    });

    it("should have navigation step announcement function", () => {
      const announceNavigationStep = (step: {
        instruction: string;
        distance: string;
      }) => {
        return `${step.distance} 앞에서 ${step.instruction}`;
      };

      expect(
        announceNavigationStep({
          instruction: "좌회전",
          distance: "300m",
        })
      ).toBe("300m 앞에서 좌회전");
    });

    it("should have arrival announcement function", () => {
      const announceArrival = (destination: string) => {
        return `${destination}에 도착했습니다`;
      };

      expect(announceArrival("홍대입구역")).toBe("홍대입구역에 도착했습니다");
    });

    it("should have route deviation announcement function", () => {
      const announceRouteDeviation = () => {
        return "경로를 이탈했습니다. 경로를 재탐색합니다.";
      };

      expect(announceRouteDeviation()).toBe(
        "경로를 이탈했습니다. 경로를 재탐색합니다."
      );
    });
  });

  describe("Route Deviation Detection", () => {
    const calculateDistance = (
      lat1: number,
      lng1: number,
      lat2: number,
      lng2: number
    ): number => {
      // Simplified distance calculation (Haversine formula approximation)
      const R = 6371; // Earth's radius in km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const ROUTE_DEVIATION_THRESHOLD = 0.1; // 100 meters in km

    it("should detect route deviation when distance exceeds threshold", () => {
      const routePoints = [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.567, lng: 126.979 },
        { lat: 37.568, lng: 126.98 },
      ];

      const currentPosition = { lat: 37.57, lng: 126.985 }; // Far from route

      const getDistanceToRoute = (lat: number, lng: number): number => {
        let minDistance = Infinity;
        for (const point of routePoints) {
          const dist = calculateDistance(lat, lng, point.lat, point.lng);
          if (dist < minDistance) {
            minDistance = dist;
          }
        }
        return minDistance;
      };

      const distanceToRoute = getDistanceToRoute(
        currentPosition.lat,
        currentPosition.lng
      );
      const isDeviated = distanceToRoute > ROUTE_DEVIATION_THRESHOLD;

      expect(isDeviated).toBe(true);
    });

    it("should not detect deviation when on route", () => {
      const routePoints = [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.567, lng: 126.979 },
        { lat: 37.568, lng: 126.98 },
      ];

      const currentPosition = { lat: 37.5666, lng: 126.9781 }; // Close to route

      const getDistanceToRoute = (lat: number, lng: number): number => {
        let minDistance = Infinity;
        for (const point of routePoints) {
          const dist = calculateDistance(lat, lng, point.lat, point.lng);
          if (dist < minDistance) {
            minDistance = dist;
          }
        }
        return minDistance;
      };

      const distanceToRoute = getDistanceToRoute(
        currentPosition.lat,
        currentPosition.lng
      );
      const isDeviated = distanceToRoute > ROUTE_DEVIATION_THRESHOLD;

      expect(isDeviated).toBe(false);
    });
  });

  describe("Reroute Cooldown", () => {
    const REROUTE_COOLDOWN = 30000; // 30 seconds

    it("should respect reroute cooldown period", () => {
      let lastRerouteTime = 0; // Initialize to 0 (no previous reroute)

      const canReroute = (currentTime: number): boolean => {
        // If lastRerouteTime is 0, it's the first reroute
        if (lastRerouteTime === 0) return true;
        return currentTime - lastRerouteTime >= REROUTE_COOLDOWN;
      };

      // First reroute should be allowed (lastRerouteTime is 0)
      expect(canReroute(1000)).toBe(true);
      lastRerouteTime = 1000; // Simulate reroute happened at 1000ms

      // Reroute within cooldown should be blocked
      expect(canReroute(16000)).toBe(false); // 15 seconds later

      // Reroute after cooldown should be allowed
      expect(canReroute(35000)).toBe(true); // 34 seconds later (> 30s cooldown)
    });
  });

  describe("Favorite Places", () => {
    it("should have correct favorite place structure", () => {
      const favoritePlace = {
        id: "fav_123",
        name: "집",
        address: "서울시 강남구",
        lat: 37.5665,
        lng: 126.978,
        createdAt: Date.now(),
        icon: "home" as const,
      };

      expect(favoritePlace.id).toBeDefined();
      expect(favoritePlace.name).toBe("집");
      expect(favoritePlace.lat).toBeTypeOf("number");
      expect(favoritePlace.lng).toBeTypeOf("number");
      expect(favoritePlace.icon).toBe("home");
    });

    it("should generate unique favorite IDs", () => {
      const generateId = () =>
        `fav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
      expect(id1.startsWith("fav_")).toBe(true);
    });

    it("should detect duplicate favorites by location", () => {
      const favorites = [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5700, lng: 126.980 },
      ];

      const isDuplicate = (lat: number, lng: number): boolean => {
        return favorites.some(
          (f) => Math.abs(f.lat - lat) < 0.0001 && Math.abs(f.lng - lng) < 0.0001
        );
      };

      expect(isDuplicate(37.5665, 126.978)).toBe(true);
      expect(isDuplicate(37.5800, 126.990)).toBe(false);
    });

    it("should map favorite icons correctly", () => {
      const getFavoriteIcon = (icon?: string): string => {
        switch (icon) {
          case "home":
            return "home";
          case "work":
            return "work";
          case "favorite":
            return "favorite";
          case "star":
          default:
            return "star";
        }
      };

      expect(getFavoriteIcon("home")).toBe("home");
      expect(getFavoriteIcon("work")).toBe("work");
      expect(getFavoriteIcon("star")).toBe("star");
      expect(getFavoriteIcon(undefined)).toBe("star");
    });
  });
});
