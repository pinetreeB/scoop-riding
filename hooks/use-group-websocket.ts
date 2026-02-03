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
  profileImage: string | null;
  profileColor: string | null;
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

// Chat message types
interface ChatMessage {
  id: number;
  userId: number;
  userName: string | null;
  userProfileImage: string | null;
  message: string;
  messageType: "text" | "location" | "alert";
  createdAt: Date;
}

interface ChatBroadcast {
  type: "chat_broadcast";
  groupId: number;
  chatMessage: ChatMessage;
}

type ServerMessage = GroupMemberUpdate | JoinedMessage | ErrorMessage | ChatBroadcast;

interface UseGroupWebSocketOptions {
  groupId: number | null;
  enabled?: boolean;
  onMembersUpdate?: (members: GroupMember[]) => void;
  onChatMessage?: (message: ChatMessage) => void;
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
  sendChatMessage: (message: string, messageType?: "text" | "location" | "alert") => void;
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
  onChatMessage,
  onError,
}: UseGroupWebSocketOptions): UseGroupWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const currentGroupIdRef = useRef<number | null>(null);
  const lastLocationSentRef = useRef<number>(0);
  
  // Use refs for callbacks to avoid stale closures
  const onMembersUpdateRef = useRef(onMembersUpdate);
  const onChatMessageRef = useRef(onChatMessage);
  const onErrorRef = useRef(onError);
  
  // Keep refs updated
  onMembersUpdateRef.current = onMembersUpdate;
  onChatMessageRef.current = onChatMessage;
  onErrorRef.current = onError;
  const pendingLocationRef = useRef<{
    latitude: number;
    longitude: number;
    speed: number;
    distance: number;
    duration: number;
    isRiding: boolean;
  } | null>(null);
  const locationThrottleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
              // Only call the callback - let the parent component handle state updates
              // This prevents double state updates and reduces re-renders
              onMembersUpdateRef.current?.(message.members);
              break;
              
            case "error":
              console.error("[WebSocket] Server error:", message.message);
              onErrorRef.current?.(message.message);
              break;
              
            case "chat_broadcast":
              onChatMessageRef.current?.(message.chatMessage);
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
      onErrorRef.current?.("Failed to connect to server");
    }
  }, [groupId, enabled]); // Removed callback deps since we use refs

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Clear location throttle timeout
    if (locationThrottleTimeoutRef.current) {
      clearTimeout(locationThrottleTimeoutRef.current);
      locationThrottleTimeoutRef.current = null;
    }
    pendingLocationRef.current = null;
    lastLocationSentRef.current = 0;
    
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

  // Adaptive throttled location update
  // - Fast updates when moving (0.5 second)
  // - Slow updates when stationary (1.5 seconds)
  const LOCATION_THROTTLE_FAST_MS = 500; // When moving - faster for real-time feel
  const LOCATION_THROTTLE_SLOW_MS = 1500; // When stationary - still responsive
  const SPEED_THRESHOLD = 2; // km/h - below this is considered stationary
  
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

    const now = Date.now();
    const timeSinceLastSent = now - lastLocationSentRef.current;
    
    // Store the latest location
    pendingLocationRef.current = location;
    
    // Adaptive throttle based on speed
    const throttleMs = location.speed > SPEED_THRESHOLD 
      ? LOCATION_THROTTLE_FAST_MS 
      : LOCATION_THROTTLE_SLOW_MS;
    
    // If enough time has passed, send immediately
    if (timeSinceLastSent >= throttleMs) {
      lastLocationSentRef.current = now;
      wsRef.current.send(JSON.stringify({
        type: "location_update",
        groupId: currentGroupIdRef.current,
        userId: 0,
        userName: "",
        ...location,
        timestamp: now,
      }));
      pendingLocationRef.current = null;
      
      // Clear any pending timeout
      if (locationThrottleTimeoutRef.current) {
        clearTimeout(locationThrottleTimeoutRef.current);
        locationThrottleTimeoutRef.current = null;
      }
    } else if (!locationThrottleTimeoutRef.current) {
      // Schedule a delayed send for the remaining time
      const delay = throttleMs - timeSinceLastSent;
      locationThrottleTimeoutRef.current = setTimeout(() => {
        if (pendingLocationRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentGroupIdRef.current) {
          lastLocationSentRef.current = Date.now();
          wsRef.current.send(JSON.stringify({
            type: "location_update",
            groupId: currentGroupIdRef.current,
            userId: 0,
            userName: "",
            ...pendingLocationRef.current,
            timestamp: Date.now(),
          }));
          pendingLocationRef.current = null;
        }
        locationThrottleTimeoutRef.current = null;
      }, delay);
    }
    // If a timeout is already scheduled, just update pendingLocationRef (already done above)
  }, []);

  const sendChatMessage = useCallback((message: string, messageType: "text" | "location" | "alert" = "text") => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !currentGroupIdRef.current) {
      console.warn("[WebSocket] Cannot send chat message: not connected");
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: "chat_message",
      groupId: currentGroupIdRef.current,
      message,
      messageType,
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
    sendChatMessage,
    reconnect,
  };
}
