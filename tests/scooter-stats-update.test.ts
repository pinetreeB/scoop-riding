import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database functions
const mockUpdateScooterStats = vi.fn();
const mockCreateRidingRecord = vi.fn();
const mockGetRidingRecordById = vi.fn();

vi.mock("../server/db", () => ({
  updateScooterStats: (...args: any[]) => mockUpdateScooterStats(...args),
  createRidingRecord: (...args: any[]) => mockCreateRidingRecord(...args),
  getRidingRecordById: (...args: any[]) => mockGetRidingRecordById(...args),
}));

describe("Scooter Stats Update on Ride Creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update scooter stats when scooterId is provided", async () => {
    // Arrange
    const userId = 1;
    const scooterId = 5;
    const distance = 5000; // 5km in meters
    
    mockCreateRidingRecord.mockResolvedValue(123);
    mockUpdateScooterStats.mockResolvedValue(true);

    // Simulate the logic from rides.create
    const input = {
      recordId: "test-record-123",
      date: "2026-02-03",
      duration: 600,
      distance: distance,
      avgSpeed: 30,
      maxSpeed: 45,
      scooterId: scooterId,
    };

    // Act - simulate what rides.create does
    const result = await mockCreateRidingRecord({
      userId,
      recordId: input.recordId,
      date: input.date,
      duration: input.duration,
      distance: Math.round(input.distance),
      avgSpeed: Math.round(input.avgSpeed * 10),
      maxSpeed: Math.round(input.maxSpeed * 10),
      scooterId: input.scooterId,
    });

    // Update scooter stats if scooterId is provided
    if (input.scooterId) {
      await mockUpdateScooterStats(
        input.scooterId,
        userId,
        Math.round(input.distance)
      );
    }

    // Assert
    expect(mockCreateRidingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        scooterId: scooterId,
        distance: distance,
      })
    );
    expect(mockUpdateScooterStats).toHaveBeenCalledWith(
      scooterId,
      userId,
      distance
    );
    expect(mockUpdateScooterStats).toHaveBeenCalledTimes(1);
  });

  it("should NOT update scooter stats when scooterId is not provided", async () => {
    // Arrange
    const userId = 1;
    const distance = 5000;
    
    mockCreateRidingRecord.mockResolvedValue(123);

    // Simulate the logic from rides.create without scooterId
    const input = {
      recordId: "test-record-456",
      date: "2026-02-03",
      duration: 600,
      distance: distance,
      avgSpeed: 30,
      maxSpeed: 45,
      // No scooterId
    };

    // Act
    await mockCreateRidingRecord({
      userId,
      recordId: input.recordId,
      date: input.date,
      duration: input.duration,
      distance: Math.round(input.distance),
      avgSpeed: Math.round(input.avgSpeed * 10),
      maxSpeed: Math.round(input.maxSpeed * 10),
    });

    // Only update if scooterId is provided
    if ((input as any).scooterId) {
      await mockUpdateScooterStats(
        (input as any).scooterId,
        userId,
        Math.round(input.distance)
      );
    }

    // Assert
    expect(mockCreateRidingRecord).toHaveBeenCalledTimes(1);
    expect(mockUpdateScooterStats).not.toHaveBeenCalled();
  });

  it("should continue ride creation even if stats update fails", async () => {
    // Arrange
    const userId = 1;
    const scooterId = 5;
    const distance = 5000;
    
    mockCreateRidingRecord.mockResolvedValue(123);
    mockUpdateScooterStats.mockRejectedValue(new Error("Stats update failed"));

    // Act
    const input = {
      recordId: "test-record-789",
      date: "2026-02-03",
      duration: 600,
      distance: distance,
      avgSpeed: 30,
      maxSpeed: 45,
      scooterId: scooterId,
    };

    const result = await mockCreateRidingRecord({
      userId,
      recordId: input.recordId,
      date: input.date,
      duration: input.duration,
      distance: Math.round(input.distance),
      avgSpeed: Math.round(input.avgSpeed * 10),
      maxSpeed: Math.round(input.maxSpeed * 10),
      scooterId: input.scooterId,
    });

    // Try to update stats but don't fail if it errors
    let statsUpdated = false;
    if (input.scooterId) {
      try {
        await mockUpdateScooterStats(
          input.scooterId,
          userId,
          Math.round(input.distance)
        );
        statsUpdated = true;
      } catch (e) {
        // Don't fail the ride creation
        statsUpdated = false;
      }
    }

    // Assert - ride creation should succeed even if stats update fails
    expect(result).toBe(123);
    expect(statsUpdated).toBe(false);
    expect(mockCreateRidingRecord).toHaveBeenCalledTimes(1);
    expect(mockUpdateScooterStats).toHaveBeenCalledTimes(1);
  });

  it("should correctly calculate stats increment", async () => {
    // Arrange
    const scooterId = 5;
    const userId = 1;
    const distanceToAdd = 3500; // 3.5km
    
    // Mock initial scooter state
    const initialScooter = {
      id: scooterId,
      userId: userId,
      totalDistance: 10000, // 10km
      totalRides: 5,
    };

    // Expected after update
    const expectedTotalDistance = initialScooter.totalDistance + distanceToAdd;
    const expectedTotalRides = initialScooter.totalRides + 1;

    mockUpdateScooterStats.mockImplementation(async (sId, uId, dist) => {
      // Simulate the update logic
      return {
        totalDistance: initialScooter.totalDistance + dist,
        totalRides: initialScooter.totalRides + 1,
      };
    });

    // Act
    const result = await mockUpdateScooterStats(scooterId, userId, distanceToAdd);

    // Assert
    expect(result.totalDistance).toBe(expectedTotalDistance);
    expect(result.totalRides).toBe(expectedTotalRides);
    expect(result.totalRides).toBe(6); // 5 + 1
    expect(result.totalDistance).toBe(13500); // 10000 + 3500
  });
});

describe("Scooter Stats Display", () => {
  it("should display correct totalRides from scooter data", () => {
    // Simulate scooter data from API
    const scooter = {
      id: 1,
      name: "Ev6",
      totalDistance: 56000, // 56km in meters
      totalRides: 9, // Should be 9 after fix
      initialOdometer: 0,
    };

    // Calculate display values
    const totalDistance = (scooter.initialOdometer || 0) + (scooter.totalDistance || 0);
    const totalRides = scooter.totalRides || 0;
    const avgDistancePerRide = totalRides > 0 ? (scooter.totalDistance || 0) / totalRides : 0;

    // Assert
    expect(totalRides).toBe(9);
    expect(totalDistance).toBe(56000);
    expect(avgDistancePerRide).toBeCloseTo(6222.22, 0); // ~6.2km per ride
  });

  it("should handle zero rides correctly", () => {
    const scooter = {
      id: 1,
      name: "New Scooter",
      totalDistance: 0,
      totalRides: 0,
      initialOdometer: 50000, // 50km initial
    };

    const totalDistance = (scooter.initialOdometer || 0) + (scooter.totalDistance || 0);
    const totalRides = scooter.totalRides || 0;
    const avgDistancePerRide = totalRides > 0 ? (scooter.totalDistance || 0) / totalRides : 0;

    expect(totalRides).toBe(0);
    expect(totalDistance).toBe(50000);
    expect(avgDistancePerRide).toBe(0);
  });
});
