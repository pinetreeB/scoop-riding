import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database function
const mockGetAllRidingRecordsAdmin = vi.fn();

vi.mock("../server/db", () => ({
  getAllRidingRecordsAdmin: (page: number, limit: number) =>
    mockGetAllRidingRecordsAdmin(page, limit),
}));

describe("Admin Riding Records API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllRidingRecordsAdmin", () => {
    it("should return paginated riding records with user info", async () => {
      const mockRecords = [
        {
          id: 1,
          recordId: "record-1",
          userId: 100,
          userName: "테스트 유저",
          userEmail: "test@example.com",
          date: "2026-02-03",
          distance: 5000,
          duration: 1800,
          avgSpeed: 100,
          maxSpeed: 150,
          scooterId: 1,
          scooterName: "테스트 킥보드",
          createdAt: new Date("2026-02-03T10:00:00Z"),
        },
        {
          id: 2,
          recordId: "record-2",
          userId: 101,
          userName: "유저2",
          userEmail: "user2@example.com",
          date: "2026-02-02",
          distance: 3000,
          duration: 1200,
          avgSpeed: 90,
          maxSpeed: 120,
          scooterId: null,
          scooterName: null,
          createdAt: new Date("2026-02-02T15:00:00Z"),
        },
      ];

      mockGetAllRidingRecordsAdmin.mockResolvedValue({
        records: mockRecords,
        total: 100,
      });

      const result = await mockGetAllRidingRecordsAdmin(1, 50);

      expect(mockGetAllRidingRecordsAdmin).toHaveBeenCalledWith(1, 50);
      expect(result.records).toHaveLength(2);
      expect(result.total).toBe(100);
      expect(result.records[0].userName).toBe("테스트 유저");
      expect(result.records[0].userEmail).toBe("test@example.com");
    });

    it("should return records ordered by createdAt descending", async () => {
      const mockRecords = [
        {
          id: 2,
          createdAt: new Date("2026-02-03T10:00:00Z"),
        },
        {
          id: 1,
          createdAt: new Date("2026-02-02T10:00:00Z"),
        },
      ];

      mockGetAllRidingRecordsAdmin.mockResolvedValue({
        records: mockRecords,
        total: 2,
      });

      const result = await mockGetAllRidingRecordsAdmin(1, 50);

      // First record should be more recent
      expect(new Date(result.records[0].createdAt).getTime()).toBeGreaterThan(
        new Date(result.records[1].createdAt).getTime()
      );
    });

    it("should handle pagination correctly", async () => {
      mockGetAllRidingRecordsAdmin.mockResolvedValue({
        records: [],
        total: 150,
      });

      // Page 1
      await mockGetAllRidingRecordsAdmin(1, 50);
      expect(mockGetAllRidingRecordsAdmin).toHaveBeenCalledWith(1, 50);

      // Page 2
      await mockGetAllRidingRecordsAdmin(2, 50);
      expect(mockGetAllRidingRecordsAdmin).toHaveBeenCalledWith(2, 50);

      // Page 3
      await mockGetAllRidingRecordsAdmin(3, 50);
      expect(mockGetAllRidingRecordsAdmin).toHaveBeenCalledWith(3, 50);
    });

    it("should return empty array when no records exist", async () => {
      mockGetAllRidingRecordsAdmin.mockResolvedValue({
        records: [],
        total: 0,
      });

      const result = await mockGetAllRidingRecordsAdmin(1, 50);

      expect(result.records).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should include scooter name when scooterId is present", async () => {
      const mockRecords = [
        {
          id: 1,
          scooterId: 5,
          scooterName: "나인봇 맥스",
        },
      ];

      mockGetAllRidingRecordsAdmin.mockResolvedValue({
        records: mockRecords,
        total: 1,
      });

      const result = await mockGetAllRidingRecordsAdmin(1, 50);

      expect(result.records[0].scooterId).toBe(5);
      expect(result.records[0].scooterName).toBe("나인봇 맥스");
    });

    it("should handle null scooter info correctly", async () => {
      const mockRecords = [
        {
          id: 1,
          scooterId: null,
          scooterName: null,
        },
      ];

      mockGetAllRidingRecordsAdmin.mockResolvedValue({
        records: mockRecords,
        total: 1,
      });

      const result = await mockGetAllRidingRecordsAdmin(1, 50);

      expect(result.records[0].scooterId).toBeNull();
      expect(result.records[0].scooterName).toBeNull();
    });
  });
});
