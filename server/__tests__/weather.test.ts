import { describe, it, expect } from "vitest";
import { getWeatherInfo, convertToGrid } from "../weather";

describe("Weather API", () => {
  it("should convert coordinates to grid correctly", () => {
    // Seoul City Hall coordinates
    const { nx, ny } = convertToGrid(37.5665, 126.9780);
    expect(nx).toBeGreaterThan(50);
    expect(nx).toBeLessThan(70);
    expect(ny).toBeGreaterThan(120);
    expect(ny).toBeLessThan(140);
  });

  // 기상청 API 키 활성화 테스트
  it("should fetch weather info from KMA API", async () => {
    const apiKey = process.env.KMA_API_KEY;
    if (!apiKey) {
      console.log("KMA_API_KEY not set, skipping API test");
      return;
    }

    // Seoul City Hall coordinates
    const weather = await getWeatherInfo(37.5665, 126.9780, apiKey);
    
    expect(weather).not.toBeNull();
    if (weather) {
      expect(weather.temperature).toBeDefined();
      expect(weather.humidity).toBeDefined();
      expect(weather.weatherCondition).toBeDefined();
      expect(weather.fetchedAt).toBeDefined();
      console.log("Weather fetched successfully:", weather);
    }
  }, 15000); // 15 second timeout for API call
});
