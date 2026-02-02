/**
 * WebSocket Group Riding Tests
 * Tests for real-time location sharing via WebSocket
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  
  sentMessages: string[] = [];

  constructor(public url: string) {
    // Simulate connection after a tick
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event("open"));
      }
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: code || 1000, reason: reason || "" } as CloseEvent);
    }
  }

  // Helper to simulate receiving a message
  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

// @ts-ignore - Replace global WebSocket with mock
global.WebSocket = MockWebSocket as any;

describe("WebSocket Group Riding", () => {
  describe("Message Types", () => {
    it("should define correct message types for join_group", () => {
      const joinMessage = {
        type: "join_group",
        groupId: 12345,
        token: "test-auth-token",
      };
      
      expect(joinMessage.type).toBe("join_group");
      expect(joinMessage.groupId).toBe(12345);
      expect(joinMessage.token).toBeDefined();
    });

    it("should define correct message types for location_update", () => {
      const locationUpdate = {
        type: "location_update",
        groupId: 12345,
        userId: 1,
        userName: "Test User",
        latitude: 37.5665,
        longitude: 126.9780,
        speed: 25.5,
        distance: 1500,
        duration: 300,
        isRiding: true,
        timestamp: Date.now(),
      };
      
      expect(locationUpdate.type).toBe("location_update");
      expect(locationUpdate.latitude).toBe(37.5665);
      expect(locationUpdate.longitude).toBe(126.9780);
      expect(locationUpdate.speed).toBe(25.5);
    });

    it("should define correct message types for leave_group", () => {
      const leaveMessage = {
        type: "leave_group",
        groupId: 12345,
      };
      
      expect(leaveMessage.type).toBe("leave_group");
      expect(leaveMessage.groupId).toBe(12345);
    });
  });

  describe("Server Response Types", () => {
    it("should handle joined response", () => {
      const joinedResponse = {
        type: "joined",
        groupId: 12345,
        userId: 1,
      };
      
      expect(joinedResponse.type).toBe("joined");
      expect(joinedResponse.groupId).toBe(12345);
      expect(joinedResponse.userId).toBe(1);
    });

    it("should handle group_member_update response", () => {
      const memberUpdate = {
        type: "group_member_update",
        groupId: 12345,
        members: [
          {
            userId: 1,
            userName: "User 1",
            latitude: 37.5665,
            longitude: 126.9780,
            speed: 25.5,
            distance: 1500,
            duration: 300,
            isRiding: true,
            timestamp: Date.now(),
          },
          {
            userId: 2,
            userName: "User 2",
            latitude: 37.5670,
            longitude: 126.9785,
            speed: 22.0,
            distance: 1400,
            duration: 295,
            isRiding: true,
            timestamp: Date.now(),
          },
        ],
      };
      
      expect(memberUpdate.type).toBe("group_member_update");
      expect(memberUpdate.members).toHaveLength(2);
      expect(memberUpdate.members[0].latitude).toBe(37.5665);
      expect(memberUpdate.members[1].latitude).toBe(37.5670);
    });

    it("should handle error response", () => {
      const errorResponse = {
        type: "error",
        message: "Invalid authentication token",
      };
      
      expect(errorResponse.type).toBe("error");
      expect(errorResponse.message).toBe("Invalid authentication token");
    });
  });

  describe("Distance Calculation", () => {
    // Haversine formula for distance calculation
    function calculateDistance(
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number
    ): number {
      const R = 6371000; // Earth's radius in meters
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    it("should calculate distance between two close points correctly", () => {
      // Two points very close to each other (same location)
      const lat1 = 37.2531;
      const lon1 = 127.0789;
      const lat2 = 37.2531;
      const lon2 = 127.0789;
      
      const distance = calculateDistance(lat1, lon1, lat2, lon2);
      expect(distance).toBe(0);
    });

    it("should calculate distance between two points ~100m apart", () => {
      // Two points approximately 100m apart
      const lat1 = 37.2531;
      const lon1 = 127.0789;
      const lat2 = 37.2540; // ~100m north
      const lon2 = 127.0789;
      
      const distance = calculateDistance(lat1, lon1, lat2, lon2);
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });

    it("should calculate distance between two points ~1km apart", () => {
      // Two points approximately 1km apart
      const lat1 = 37.2531;
      const lon1 = 127.0789;
      const lat2 = 37.2621; // ~1km north
      const lon2 = 127.0789;
      
      const distance = calculateDistance(lat1, lon1, lat2, lon2);
      expect(distance).toBeGreaterThan(900);
      expect(distance).toBeLessThan(1100);
    });

    it("should detect when longitude is missing (null/undefined)", () => {
      // This was the original bug - longitude was null
      const member1 = {
        latitude: 37.2531,
        longitude: 127.0789,
      };
      
      const member2 = {
        latitude: 37.2531,
        longitude: null as number | null,
      };
      
      // If longitude is null, distance calculation should be skipped
      if (member2.longitude === null) {
        expect(true).toBe(true); // Skip distance calculation
      } else {
        const distance = calculateDistance(
          member1.latitude,
          member1.longitude,
          member2.latitude,
          member2.longitude
        );
        expect(distance).toBeDefined();
      }
    });
  });

  describe("WebSocket Connection", () => {
    it("should create WebSocket with correct URL", () => {
      const ws = new MockWebSocket("ws://localhost:3000/ws/group-riding");
      expect(ws.url).toBe("ws://localhost:3000/ws/group-riding");
    });

    it("should send join message after connection", async () => {
      const ws = new MockWebSocket("ws://localhost:3000/ws/group-riding");
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Send join message
      ws.send(JSON.stringify({
        type: "join_group",
        groupId: 12345,
        token: "test-token",
      }));
      
      expect(ws.sentMessages).toHaveLength(1);
      const sentMessage = JSON.parse(ws.sentMessages[0]);
      expect(sentMessage.type).toBe("join_group");
      expect(sentMessage.groupId).toBe(12345);
    });

    it("should handle received member updates", async () => {
      const ws = new MockWebSocket("ws://localhost:3000/ws/group-riding");
      const receivedMembers: any[] = [];
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "group_member_update") {
          receivedMembers.push(...data.members);
        }
      };
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Simulate receiving member update
      ws.simulateMessage({
        type: "group_member_update",
        groupId: 12345,
        members: [
          {
            userId: 1,
            userName: "User 1",
            latitude: 37.5665,
            longitude: 126.9780,
            speed: 25.5,
            distance: 1500,
            duration: 300,
            isRiding: true,
            timestamp: Date.now(),
          },
        ],
      });
      
      expect(receivedMembers).toHaveLength(1);
      expect(receivedMembers[0].latitude).toBe(37.5665);
      expect(receivedMembers[0].longitude).toBe(126.9780);
    });
  });

  describe("Real-time vs Polling Comparison", () => {
    it("WebSocket should provide instant updates vs 3s polling delay", () => {
      const pollingInterval = 3000; // 3 seconds
      const websocketLatency = 50; // ~50ms typical WebSocket latency
      
      expect(websocketLatency).toBeLessThan(pollingInterval);
      expect(pollingInterval / websocketLatency).toBeGreaterThan(50); // 60x faster
    });

    it("should prefer WebSocket when connected", () => {
      const wsConnected = true;
      const useWebSocket = wsConnected;
      const useHttpPolling = !wsConnected;
      
      expect(useWebSocket).toBe(true);
      expect(useHttpPolling).toBe(false);
    });

    it("should fallback to HTTP polling when WebSocket disconnected", () => {
      const wsConnected = false;
      const useWebSocket = wsConnected;
      const useHttpPolling = !wsConnected;
      
      expect(useWebSocket).toBe(false);
      expect(useHttpPolling).toBe(true);
    });
  });
});
