import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Google Maps Components", () => {
  describe("Component Files Exist", () => {
    it("should have GoogleRideMap component file", () => {
      const filePath = path.join(process.cwd(), "components/google-ride-map.tsx");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should have GoogleFriendLocationMap component file", () => {
      const filePath = path.join(process.cwd(), "components/google-friend-location-map.tsx");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should have GoogleCompareMap component file", () => {
      const filePath = path.join(process.cwd(), "components/google-compare-map.tsx");
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("should have map-selector utility file", () => {
      const filePath = path.join(process.cwd(), "components/map-selector.tsx");
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("Component File Contents", () => {
    it("GoogleRideMap should import react-native-maps", () => {
      const filePath = path.join(process.cwd(), "components/google-ride-map.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("react-native-maps");
      expect(content).toContain("PROVIDER_GOOGLE");
    });

    it("GoogleFriendLocationMap should import react-native-maps", () => {
      const filePath = path.join(process.cwd(), "components/google-friend-location-map.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("react-native-maps");
      expect(content).toContain("PROVIDER_GOOGLE");
    });

    it("GoogleCompareMap should import react-native-maps", () => {
      const filePath = path.join(process.cwd(), "components/google-compare-map.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("react-native-maps");
      expect(content).toContain("PROVIDER_GOOGLE");
    });
  });
});

describe("Google Maps API Configuration", () => {
  it("should have API key configured in environment", () => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
  });

  it("should have valid API key format", () => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    expect(apiKey?.startsWith("AIza")).toBe(true);
    expect(apiKey?.length).toBeGreaterThanOrEqual(30);
  });
});

describe("App Configuration", () => {
  it("should have Google Maps API key in app.config.ts", () => {
    const filePath = path.join(process.cwd(), "app.config.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("googleMaps");
    expect(content).toContain("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");
  });

  it("should have app name set to SCOOP Riders", () => {
    const filePath = path.join(process.cwd(), "app.config.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('appName: "SCOOP Riders"');
  });
});

describe("Screen Integration", () => {
  it("riding.tsx should import GoogleRideMap", () => {
    const filePath = path.join(process.cwd(), "app/riding.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("GoogleRideMap");
    expect(content).toContain('Platform.OS !== "web"');
  });

  it("ride-detail.tsx should import GoogleRideMap", () => {
    const filePath = path.join(process.cwd(), "app/ride-detail.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("GoogleRideMap");
  });

  it("friends-map.tsx should import GoogleFriendLocationMap", () => {
    const filePath = path.join(process.cwd(), "app/friends-map.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("GoogleFriendLocationMap");
  });

  it("compare-routes.tsx should import GoogleCompareMap", () => {
    const filePath = path.join(process.cwd(), "app/compare-routes.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("GoogleCompareMap");
  });
});
