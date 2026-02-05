import { describe, it, expect } from "vitest";

describe("GCP Cloud Run Server", () => {
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

  it("should have API_BASE_URL configured", () => {
    expect(API_BASE_URL).toBeDefined();
    expect(API_BASE_URL).toContain("https://");
    expect(API_BASE_URL).toContain("asia-northeast3");
  });

  it("should respond to health check", async () => {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.timestamp).toBeDefined();
  });

  it("should respond to tRPC endpoint with auth error (expected)", async () => {
    const response = await fetch(`${API_BASE_URL}/api/trpc/rides.list?input=%7B%7D`);
    // 401 Unauthorized is expected because we're not authenticated
    expect(response.status).toBe(401);
    
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});
