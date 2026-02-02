/**
 * WebSocket hook for real-time group riding location sharing
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Types matching server WebSocket messages
interface GroupMember {
  userId: number;
  userName: string;
  latitude: number;
  longitude: number;
  speed: number;
  distance: number;
  duration: number;
  isRiding: boolean;
  timestamp: number;
}

interface GroupMemberUpdate {
  type: "group_member_update";
  groupId: number;
  members: GroupMember[];
}

interface JoinedMessage {
  type: "joined";
  groupId: number;
  userId: number;
}

interface ErrorMessage {
  type: "error";
  message: string;
}

type ServerMessage = GroupMemberUpdate | JoinedMessage | ErrorMessage;

interface UseGroupWebSocketOptions {
  groupId: number | null;
  enabled?: boolean;
  onMembersUpdate?: (members: GroupMember[]) => void;
  onError?: (error: string) => void;
}

interface UseGroupWebSocketReturn {
  isConnected: boolean;
  members: GroupMember[];
  sendLocationUpdate: (location: {
    latitude: number;
    longitude: number;
    speed: number;
    distance: number;
    duration: number;
    isRiding: boolean;
  }) => void;
  reconnect: () => void;
}

// Get WebSocket URL based on environment
function getWebSocketUrl(): string {
  // In production, use the API server URL
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3000";
  // Convert http(s) to ws(s)
  const wsUrl = apiUrl.replace(/^http/, "ws");
  return `${wsUrl}/ws/group-riding`;
}

// Get auth token
async function getAuthToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      // On web, token is stored in AsyncStorage
      return await AsyncStorage.getItem("auth_token");
    } else {
      // On native, token is stored in SecureStore
      return await SecureStore.getItemAsync("auth_token");
    }
  } catch (error) {
    console.error("[WebSocket] Failed to get auth token:", error);
    return null;
  }
}

export function useGroupWebSocket({
  groupId,
  enabled = true,
  onMembersUpdate,
  onError,
}: UseGroupWebSocketOptions): UseGroupWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const currentGroupIdRef = useRef<number | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);

  const connect = useCallback(async () => {
    if (!groupId || !enabled) return;
    
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const token = await getAuthToken();
    if (!token) {
      console.error("[WebSocket] No auth token available");
      onError?.("Authentication required");
      return;
    }

    const wsUrl = getWebSocketUrl();
    console.log(`[WebSocket] Connecting to ${wsUrl} for group ${groupId}`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      currentGroupIdRef.current = groupId;

      ws.onopen = () => {
        console.log("[WebSocket] Connected, joining group", groupId);
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Send join message with auth token
        ws.send(JSON.stringify({
          type: "join_group",
          groupId,
          token,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          
          switch (message.type) {
            case "joined":
              console.log(`[WebSocket] Joined group ${message.groupId} as user ${message.userId}`);
              break;
              
            case "group_member_update":
              console.log(`[WebSocket] Received ${message.members.length} member locations`);
              setMembers(message.members);
              onMembersUpdate?.(message.members);
              break;
              
            case "error":
              console.error("[WebSocket] Server error:", message.message);
              onError?.(message.message);
              break;
          }
        } catch (error) {
          console.error("[WebSocket] Failed to parse message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected: code=${event.code}, reason=${event.reason}`);
        setIsConnected(false);
        wsRef.current = null;
        
        // Auto-reconnect if still in group and not intentionally closed
        if (currentGroupIdRef.current && enabled && event.code !== 1000) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };
    } catch (error) {
      console.error("[WebSocket] Failed to create connection:", error);
      onError?.("Failed to connect to server");
    }
  }, [groupId, enabled, onMembersUpdate, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      // Send leave message before closing
      if (currentGroupIdRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "leave_group",
          groupId: currentGroupIdRef.current,
        }));
      }
      wsRef.current.close(1000, "User left group");
      wsRef.current = null;
    }
    
    currentGroupIdRef.current = null;
    setIsConnected(false);
    setMembers([]);
  }, []);

  const sendLocationUpdate = useCallback((location: {
    latitude: number;
    longitude: number;
    speed: number;
    distance: number;
    duration: number;
    isRiding: boolean;
  }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !currentGroupIdRef.current) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: "location_update",
      groupId: currentGroupIdRef.current,
      userId: 0, // Server will fill this from auth
      userName: "", // Server will fill this from auth
      ...location,
      timestamp: Date.now(),
    }));
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, disconnect]);

  // Connect when groupId changes
  useEffect(() => {
    if (groupId && enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [groupId, enabled, connect, disconnect]);

  return {
    isConnected,
    members,
    sendLocationUpdate,
    reconnect,
  };
}
