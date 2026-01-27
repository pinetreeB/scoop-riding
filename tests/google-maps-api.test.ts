import { describe, it, expect } from "vitest";

describe("Google Maps API Key", () => {
  it("should have EXPO_PUBLIC_GOOGLE_MAPS_API_KEY environment variable set", () => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    expect(apiKey?.startsWith("AIza")).toBe(true);
  });

  it("should be a valid Google Maps API key format", () => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    // Google API keys are typically 39 characters and start with "AIza"
    expect(apiKey?.length).toBeGreaterThanOrEqual(30);
    expect(apiKey?.length).toBeLessThanOrEqual(50);
  });

  it("should be able to make a geocoding request", async () => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    // Test with a simple geocoding request to validate the API key
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=Seoul,Korea&key=${apiKey}`
    );
    
    const data = await response.json();
    
    // Check if the API key is valid (not necessarily that geocoding is enabled)
    // If the key is invalid, we get REQUEST_DENIED
    // If the key is valid but geocoding is not enabled, we might get other errors
    expect(data.status).not.toBe("REQUEST_DENIED");
    
    // If we get OK or ZERO_RESULTS, the key is working
    if (data.status === "OK") {
      expect(data.results).toBeDefined();
      expect(data.results.length).toBeGreaterThan(0);
    }
  });
});
