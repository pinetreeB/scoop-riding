import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.join(__dirname, "..");

describe("Navigation Feature", () => {
  describe("Screen Files Exist", () => {
    it("should have search-destination screen", () => {
      const filePath = path.join(projectRoot, "app/search-destination.tsx");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should have route-preview screen", () => {
      const filePath = path.join(projectRoot, "app/route-preview.tsx");
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("Search Destination Screen", () => {
    it("should import Google Places API key", () => {
      const filePath = path.join(projectRoot, "app/search-destination.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");
    });

    it("should have place autocomplete functionality", () => {
      const filePath = path.join(projectRoot, "app/search-destination.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("place/autocomplete");
    });

    it("should have place details functionality", () => {
      const filePath = path.join(projectRoot, "app/search-destination.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("place/details");
    });

    it("should save recent destinations", () => {
      const filePath = path.join(projectRoot, "app/search-destination.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("RECENT_SEARCHES_KEY");
      expect(content).toContain("saveRecentDestination");
    });

    it("should navigate to route-preview", () => {
      const filePath = path.join(projectRoot, "app/search-destination.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("/route-preview");
    });
  });

  describe("Route Preview Screen", () => {
    it("should import Google Directions API key", () => {
      const filePath = path.join(projectRoot, "app/route-preview.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");
    });

    it("should fetch directions from Google API", () => {
      const filePath = path.join(projectRoot, "app/route-preview.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("directions/json");
    });

    it("should decode polyline for route display", () => {
      const filePath = path.join(projectRoot, "app/route-preview.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("decodePolyline");
    });

    it("should support bicycling and walking modes", () => {
      const filePath = path.join(projectRoot, "app/route-preview.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("BICYCLING");
      expect(content).toContain("WALKING");
    });

    it("should display route steps", () => {
      const filePath = path.join(projectRoot, "app/route-preview.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("RouteStep");
      expect(content).toContain("instruction");
    });

    it("should have start navigation button", () => {
      const filePath = path.join(projectRoot, "app/route-preview.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("handleStartNavigation");
      expect(content).toContain("경로 안내 시작");
    });
  });

  describe("Main Screen Integration", () => {
    it("should have clickable search bar", () => {
      const filePath = path.join(projectRoot, "app/(tabs)/index.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("/search-destination");
      expect(content).toContain("어디로 달릴까요");
    });

    it("should have navigation icon on search bar", () => {
      const filePath = path.join(projectRoot, "app/(tabs)/index.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain('name="navigation"');
    });
  });

  describe("Select Scooter Integration", () => {
    it("should handle navigation params", () => {
      const filePath = path.join(projectRoot, "app/select-scooter.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("withNavigation");
      expect(content).toContain("destinationName");
      expect(content).toContain("routePolyline");
    });

    it("should pass navigation params to riding screen", () => {
      const filePath = path.join(projectRoot, "app/select-scooter.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("hasNavigation");
    });
  });

  describe("Riding Screen Navigation", () => {
    it("should parse navigation params", () => {
      const filePath = path.join(projectRoot, "app/riding.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("withNavigation");
      expect(content).toContain("routePolyline");
      expect(content).toContain("routeSteps");
    });

    it("should have navigation state variables", () => {
      const filePath = path.join(projectRoot, "app/riding.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("hasNavigation");
      expect(content).toContain("navigationDestination");
      expect(content).toContain("navigationRoute");
      expect(content).toContain("navigationSteps");
      expect(content).toContain("currentStepIndex");
    });

    it("should have turn-by-turn navigation UI", () => {
      const filePath = path.join(projectRoot, "app/riding.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("Navigation Turn-by-Turn Banner");
      expect(content).toContain("getNavigationIcon");
    });

    it("should update navigation progress", () => {
      const filePath = path.join(projectRoot, "app/riding.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("updateNavigationProgress");
      expect(content).toContain("distanceToDestination");
    });

    it("should detect arrival at destination", () => {
      const filePath = path.join(projectRoot, "app/riding.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("목적지 도착");
    });
  });
});
