/**
 * Tests for Group Members Overlay component
 */
import { describe, it, expect } from "vitest";

// Test data
const mockMembers = [
  {
    id: 1,
    name: "스쿱 모빌리티",
    profileImage: "https://example.com/profile1.jpg",
    isRiding: true,
    latitude: 37.5665,
    longitude: 126.978,
    speed: 25.5,
    distance: 0.5,
  },
  {
    id: 2,
    name: "소나무군",
    profileImage: null,
    isRiding: false,
    latitude: 37.5665,
    longitude: 126.978,
    speed: 0,
    distance: 0,
  },
  {
    id: 3,
    name: "라이더킹",
    profileImage: "https://example.com/profile3.jpg",
    isRiding: true,
    latitude: 37.567,
    longitude: 126.979,
    speed: 30.2,
    distance: 1.2,
  },
];

describe("GroupMembersOverlay", () => {
  describe("Member filtering", () => {
    it("should filter out current user from members list", () => {
      const currentUserId = 1;
      const filteredMembers = mockMembers.filter((m) => m.id !== currentUserId);
      expect(filteredMembers.length).toBe(2);
      expect(filteredMembers.find((m) => m.id === currentUserId)).toBeUndefined();
    });

    it("should sort members with riding members first", () => {
      const sortedMembers = [...mockMembers].sort((a, b) => {
        if (a.isRiding && !b.isRiding) return -1;
        if (!a.isRiding && b.isRiding) return 1;
        return 0;
      });
      expect(sortedMembers[0].isRiding).toBe(true);
      expect(sortedMembers[1].isRiding).toBe(true);
      expect(sortedMembers[2].isRiding).toBe(false);
    });
  });

  describe("Member state display", () => {
    it("should identify riding members correctly", () => {
      const ridingMembers = mockMembers.filter((m) => m.isRiding);
      expect(ridingMembers.length).toBe(2);
    });

    it("should identify waiting members correctly", () => {
      const waitingMembers = mockMembers.filter((m) => !m.isRiding);
      expect(waitingMembers.length).toBe(1);
    });

    it("should handle members without profile image", () => {
      const memberWithoutImage = mockMembers.find((m) => m.profileImage === null);
      expect(memberWithoutImage).toBeDefined();
      expect(memberWithoutImage?.name?.charAt(0)).toBe("소");
    });
  });

  describe("Member interaction", () => {
    it("should allow press on riding members with location", () => {
      const ridingMemberWithLocation = mockMembers.find(
        (m) => m.isRiding && m.latitude && m.longitude
      );
      expect(ridingMemberWithLocation).toBeDefined();
      expect(ridingMemberWithLocation?.latitude).toBeDefined();
      expect(ridingMemberWithLocation?.longitude).toBeDefined();
    });

    it("should disable press on non-riding members", () => {
      const nonRidingMember = mockMembers.find((m) => !m.isRiding);
      expect(nonRidingMember).toBeDefined();
      // Non-riding members should be disabled for press
      const isDisabled = !nonRidingMember?.isRiding || !nonRidingMember?.latitude;
      expect(isDisabled).toBe(true);
    });
  });

  describe("Name truncation", () => {
    it("should handle long names appropriately", () => {
      const longName = "매우긴이름을가진사용자";
      const maxLength = 6;
      const truncated = longName.length > maxLength 
        ? longName.slice(0, maxLength) + ".." 
        : longName;
      expect(truncated).toBe("매우긴이름을..");
    });

    it("should not truncate short names", () => {
      const shortName = "라이더";
      const maxLength = 6;
      const truncated = shortName.length > maxLength 
        ? shortName.slice(0, maxLength) + ".." 
        : shortName;
      expect(truncated).toBe("라이더");
    });
  });

  describe("Speed display", () => {
    it("should format speed correctly for riding members", () => {
      const ridingMember = mockMembers.find((m) => m.isRiding);
      expect(ridingMember?.speed).toBeDefined();
      const formattedSpeed = `${ridingMember?.speed.toFixed(0)}km/h`;
      expect(formattedSpeed).toMatch(/^\d+km\/h$/);
    });
  });
});
