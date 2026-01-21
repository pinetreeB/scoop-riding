import { describe, it, expect } from "vitest";
import * as jose from "jose";

// Test the token structure that should be compatible with SDK verifySession
describe("Auth Token Generation", () => {
  const JWT_SECRET = new TextEncoder().encode("test-secret-key");

  async function generateSessionToken(
    userId: number,
    openId: string,
    name: string = ""
  ): Promise<string> {
    const token = await new jose.SignJWT({
      userId,
      openId,
      appId: "scoop-riding",
      name: name || "User",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(JWT_SECRET);
    return token;
  }

  it("should generate token with all required fields", async () => {
    const token = await generateSessionToken(1, "test-open-id", "Test User");

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe(1);
    expect(payload.openId).toBe("test-open-id");
    expect(payload.appId).toBe("scoop-riding");
    expect(payload.name).toBe("Test User");
  });

  it("should use default name when not provided", async () => {
    const token = await generateSessionToken(1, "test-open-id");

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    expect(payload.name).toBe("User");
  });

  it("should include expiration time", async () => {
    const token = await generateSessionToken(1, "test-open-id", "Test");

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    expect(payload.exp).toBeDefined();
    // Should expire in ~30 days
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    expect(payload.exp! - now).toBeGreaterThan(thirtyDaysInSeconds - 60); // Allow 1 minute tolerance
    expect(payload.exp! - now).toBeLessThanOrEqual(thirtyDaysInSeconds + 60);
  });

  it("should be verifiable with correct secret", async () => {
    const token = await generateSessionToken(1, "test-open-id", "Test");

    const result = await jose.jwtVerify(token, JWT_SECRET);

    expect(result.payload).toBeDefined();
  });

  it("should fail verification with wrong secret", async () => {
    const token = await generateSessionToken(1, "test-open-id", "Test");
    const wrongSecret = new TextEncoder().encode("wrong-secret");

    await expect(jose.jwtVerify(token, wrongSecret)).rejects.toThrow();
  });

  // Test that verifySession-compatible validation works
  it("should have non-empty required string fields", async () => {
    const token = await generateSessionToken(1, "test-open-id", "Test User");

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    // These checks mirror SDK verifySession validation
    const { openId, appId, name } = payload as Record<string, unknown>;

    const isNonEmptyString = (value: unknown): value is string =>
      typeof value === "string" && value.length > 0;

    expect(isNonEmptyString(openId)).toBe(true);
    expect(isNonEmptyString(appId)).toBe(true);
    expect(isNonEmptyString(name)).toBe(true);
  });
});
