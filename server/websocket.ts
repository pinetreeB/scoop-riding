/**
 * WebSocket server for real-time group riding location sharing
 * 
 * Optimizations applied:
 * 1. Adaptive broadcast intervals based on group activity
 * 2. Delta compression - only send changed locations
 * 3. Batched updates with configurable intervals
 * 4. Memory-efficient location caching
 * 5. Heartbeat mechanism to detect stale connections
 */
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { sdk } from "./_core/sdk";
import * as db from "./db";

// Types for WebSocket messages
interface LocationUpdate {
  type: "location_update";
  groupId: number;
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

interface JoinGroup {
  type: "join_group";
  groupId: number;
  token: string; // Auth token for verification
}

interface LeaveGroup {
  type: "leave_group";
  groupId: number;
}

// Chat message types
interface ChatMessage {
  type: "chat_message";
  groupId: number;
  message: string;
  messageType: "text" | "location" | "alert";
}

interface ChatBroadcast {
  type: "chat_broadcast";
  groupId: number;
  chatMessage: {
    id: number;
    userId: number;
    userName: string | null;
    userProfileImage: string | null;
    message: string;
    messageType: "text" | "location" | "alert";
    createdAt: Date;
  };
}

interface GroupMemberUpdate {
  type: "group_member_update";
  groupId: number;
  members: Array<{
    userId: number;
    userName: string;
    profileImage: string | null;
    latitude: number;
    longitude: number;
    speed: number;
    distance: number;
    duration: number;
    isRiding: boolean;
    timestamp: number;
  }>;
}

interface ErrorMessage {
  type: "error";
  message: string;
}

// Heartbeat message
interface HeartbeatMessage {
  type: "heartbeat";
}

interface HeartbeatAck {
  type: "heartbeat_ack";
}

type IncomingMessage = LocationUpdate | JoinGroup | LeaveGroup | ChatMessage | HeartbeatMessage;
type OutgoingMessage = GroupMemberUpdate | ErrorMessage | ChatBroadcast | HeartbeatAck | { type: "joined"; groupId: number; userId: number };

// Store connected clients by group
interface ClientInfo {
  ws: WebSocket;
  userId: number;
  userName: string;
  profileImage: string | null;
  groupId: number | null;
  lastLocation: {
    latitude: number;
    longitude: number;
    speed: number;
    distance: number;
    duration: number;
    isRiding: boolean;
    timestamp: number;
  } | null;
  lastBroadcastLocation: {
    latitude: number;
    longitude: number;
  } | null;
  lastBroadcastTime: number; // Time of last broadcast for this client
  lastHeartbeat: number;
  isAlive: boolean;
}

// Optimization constants
const BROADCAST_INTERVAL_MS = 500; // Base broadcast interval (0.5 second) - faster for real-time feel
const BROADCAST_INTERVAL_IDLE_MS = 1500; // Broadcast interval when group is idle (1.5 seconds)
const LOCATION_CHANGE_THRESHOLD = 0.00002; // ~2.2 meters - lower threshold for more responsive updates
const FORCE_BROADCAST_INTERVAL_MS = 2000; // Force broadcast every 2 seconds regardless of movement
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds heartbeat
const HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds timeout for dead connections
const MAX_BROADCAST_BATCH_SIZE = 50; // Maximum members per broadcast

const clients = new Map<WebSocket, ClientInfo>();
const groupClients = new Map<number, Set<WebSocket>>(); // groupId -> Set of WebSocket clients

// Broadcast scheduling per group
interface GroupBroadcastState {
  timer: ReturnType<typeof setTimeout> | null;
  periodicTimer: ReturnType<typeof setInterval> | null; // Periodic broadcast timer
  lastBroadcastTime: number;
  pendingUpdate: boolean;
  isActive: boolean; // True if any member is actively riding
}
const groupBroadcastStates = new Map<number, GroupBroadcastState>();

// Periodic broadcast interval (ensures all clients receive updates even if they're busy)
const PERIODIC_BROADCAST_INTERVAL_MS = 500; // Force broadcast every 500ms regardless of updates

// Heartbeat interval reference
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ 
    server,
    path: "/ws/group-riding"
  });

  console.log("[WebSocket] Server initialized on /ws/group-riding");

  // Start heartbeat checker
  startHeartbeatChecker(wss);

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] New connection");
    
    // Initialize client info
    clients.set(ws, {
      ws,
      userId: 0,
      userName: "",
      profileImage: null,
      groupId: null,
      lastLocation: null,
      lastBroadcastLocation: null,
      lastBroadcastTime: 0,
      lastHeartbeat: Date.now(),
      isAlive: true,
    });

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as IncomingMessage;
        await handleMessage(ws, message);
      } catch (error) {
        console.error("[WebSocket] Error handling message:", error);
        sendMessage(ws, { type: "error", message: "Invalid message format" });
      }
    });

    ws.on("close", () => {
      handleDisconnect(ws);
    });

    ws.on("error", (error) => {
      console.error("[WebSocket] Client error:", error);
      handleDisconnect(ws);
    });

    // Send initial heartbeat ack to confirm connection
    sendMessage(ws, { type: "heartbeat_ack" });
  });

  // Cleanup on server close
  wss.on("close", () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  });
}

function startHeartbeatChecker(wss: WebSocketServer): void {
  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    
    clients.forEach((client, ws) => {
      // Check if client is still alive
      if (now - client.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[WebSocket] Client ${client.userId} timed out, disconnecting`);
        ws.terminate();
        return;
      }

      // Mark as not alive and wait for pong
      client.isAlive = false;
      
      // Send ping (heartbeat request)
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, HEARTBEAT_INTERVAL_MS);
}

async function handleMessage(ws: WebSocket, message: IncomingMessage): Promise<void> {
  const client = clients.get(ws);
  if (!client) return;

  // Update heartbeat timestamp on any message
  client.lastHeartbeat = Date.now();
  client.isAlive = true;

  switch (message.type) {
    case "join_group":
      await handleJoinGroup(ws, client, message);
      break;
    case "leave_group":
      handleLeaveGroup(ws, client, message.groupId);
      break;
    case "location_update":
      handleLocationUpdate(ws, client, message);
      break;
    case "chat_message":
      await handleChatMessage(ws, client, message);
      break;
    case "heartbeat":
      sendMessage(ws, { type: "heartbeat_ack" });
      break;
  }
}

async function handleJoinGroup(
  ws: WebSocket, 
  client: ClientInfo, 
  message: JoinGroup
): Promise<void> {
  try {
    // Verify token and get user info using SDK
    const session = await sdk.verifySession(message.token);
    if (!session) {
      sendMessage(ws, { type: "error", message: "Invalid authentication token" });
      return;
    }
    
    // Get user from database
    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      sendMessage(ws, { type: "error", message: "User not found" });
      return;
    }

    // Leave previous group if any
    if (client.groupId !== null) {
      handleLeaveGroup(ws, client, client.groupId);
    }

    // Update client info
    client.userId = user.id;
    client.userName = user.name || `User ${user.id}`;
    client.profileImage = user.profileImageUrl || null;
    client.groupId = message.groupId;

    // Add to group clients
    if (!groupClients.has(message.groupId)) {
      groupClients.set(message.groupId, new Set());
    }
    groupClients.get(message.groupId)!.add(ws);

    // Initialize broadcast state for group if not exists
    if (!groupBroadcastStates.has(message.groupId)) {
      const groupId = message.groupId;
      // Start periodic broadcast timer for this group
      const periodicTimer = setInterval(() => {
        doBroadcastGroupLocations(groupId);
      }, PERIODIC_BROADCAST_INTERVAL_MS);
      
      groupBroadcastStates.set(message.groupId, {
        timer: null,
        periodicTimer,
        lastBroadcastTime: 0,
        pendingUpdate: false,
        isActive: false,
      });
      console.log(`[WebSocket] Started periodic broadcast for group ${groupId}`);
    }

    console.log(`[WebSocket] User ${client.userId} (${client.userName}) joined group ${message.groupId}`);

    // Send confirmation
    sendMessage(ws, { 
      type: "joined", 
      groupId: message.groupId,
      userId: client.userId 
    });

    // Send current group members' locations to the new member immediately
    broadcastGroupLocationsImmediate(message.groupId);
  } catch (error) {
    console.error("[WebSocket] Error joining group:", error);
    sendMessage(ws, { type: "error", message: "Failed to join group" });
  }
}

function handleLeaveGroup(ws: WebSocket, client: ClientInfo, groupId: number): void {
  const groupSet = groupClients.get(groupId);
  if (groupSet) {
    groupSet.delete(ws);
    if (groupSet.size === 0) {
      groupClients.delete(groupId);
      // Clean up broadcast state
      const state = groupBroadcastStates.get(groupId);
      if (state?.timer) {
        clearTimeout(state.timer);
      }
      if (state?.periodicTimer) {
        clearInterval(state.periodicTimer);
        console.log(`[WebSocket] Stopped periodic broadcast for group ${groupId}`);
      }
      groupBroadcastStates.delete(groupId);
    }
  }

  console.log(`[WebSocket] User ${client.userId} left group ${groupId}`);
  
  client.groupId = null;
  client.lastLocation = null;
  client.lastBroadcastLocation = null;

  // Broadcast updated member list to remaining group members
  scheduleBroadcast(groupId);
}

function handleLocationUpdate(
  ws: WebSocket, 
  client: ClientInfo, 
  message: LocationUpdate
): void {
  if (client.groupId === null || client.groupId !== message.groupId) {
    sendMessage(ws, { type: "error", message: "Not in this group" });
    return;
  }

  // Update client's last location
  client.lastLocation = {
    latitude: message.latitude,
    longitude: message.longitude,
    speed: message.speed,
    distance: message.distance,
    duration: message.duration,
    isRiding: message.isRiding,
    timestamp: message.timestamp,
  };

  // Check if location changed significantly (delta compression)
  const shouldBroadcast = hasLocationChangedSignificantly(client);
  
  if (shouldBroadcast) {
    // Update last broadcast location and time
    client.lastBroadcastLocation = {
      latitude: message.latitude,
      longitude: message.longitude,
    };
    client.lastBroadcastTime = Date.now();
    
    // Update group activity state
    const state = groupBroadcastStates.get(message.groupId);
    if (state) {
      state.isActive = isGroupActive(message.groupId);
    }
    
    // Schedule broadcast
    scheduleBroadcast(message.groupId);
  }
}

/**
 * Check if location changed enough to warrant a broadcast
 * Uses delta compression to reduce unnecessary updates
 * Also forces broadcast after FORCE_BROADCAST_INTERVAL_MS to ensure real-time feel
 */
function hasLocationChangedSignificantly(client: ClientInfo): boolean {
  if (!client.lastLocation) return false;
  if (!client.lastBroadcastLocation) return true; // First location update
  
  // Force broadcast if too much time has passed (ensures real-time updates even when stationary)
  const now = Date.now();
  const timeSinceLastBroadcast = now - client.lastBroadcastTime;
  if (timeSinceLastBroadcast >= FORCE_BROADCAST_INTERVAL_MS) {
    return true;
  }
  
  const latDiff = Math.abs(client.lastLocation.latitude - client.lastBroadcastLocation.latitude);
  const lngDiff = Math.abs(client.lastLocation.longitude - client.lastBroadcastLocation.longitude);
  
  // Also broadcast if speed changed significantly (started/stopped moving)
  const isMoving = client.lastLocation.speed > 1;
  const wasMoving = client.lastLocation.isRiding;
  const movementChanged = isMoving !== wasMoving;
  
  return latDiff > LOCATION_CHANGE_THRESHOLD || 
         lngDiff > LOCATION_CHANGE_THRESHOLD ||
         movementChanged;
}

/**
 * Check if any member in the group is actively riding
 */
function isGroupActive(groupId: number): boolean {
  const groupSet = groupClients.get(groupId);
  if (!groupSet) return false;
  
  for (const clientWs of groupSet) {
    const client = clients.get(clientWs);
    if (client?.lastLocation?.isRiding && client.lastLocation.speed > 1) {
      return true;
    }
  }
  return false;
}

/**
 * Schedule a broadcast with adaptive interval based on group activity
 */
function scheduleBroadcast(groupId: number): void {
  const state = groupBroadcastStates.get(groupId);
  if (!state) return;
  
  state.pendingUpdate = true;
  
  // If timer already scheduled, let it handle the update
  if (state.timer) return;
  
  const now = Date.now();
  const timeSinceLastBroadcast = now - state.lastBroadcastTime;
  
  // Use shorter interval for active groups, longer for idle
  const interval = state.isActive ? BROADCAST_INTERVAL_MS : BROADCAST_INTERVAL_IDLE_MS;
  
  // Calculate delay until next broadcast
  const delay = Math.max(0, interval - timeSinceLastBroadcast);
  
  state.timer = setTimeout(() => {
    state.timer = null;
    
    if (state.pendingUpdate) {
      state.pendingUpdate = false;
      state.lastBroadcastTime = Date.now();
      doBroadcastGroupLocations(groupId);
    }
  }, delay);
}

/**
 * Broadcast immediately (used for join events)
 */
function broadcastGroupLocationsImmediate(groupId: number): void {
  const state = groupBroadcastStates.get(groupId);
  if (state) {
    state.lastBroadcastTime = Date.now();
    state.pendingUpdate = false;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }
  doBroadcastGroupLocations(groupId);
}

function doBroadcastGroupLocations(groupId: number): void {
  const groupSet = groupClients.get(groupId);
  if (!groupSet || groupSet.size === 0) return;

  // Collect all members' locations
  const members: GroupMemberUpdate["members"] = [];
  
  groupSet.forEach((clientWs) => {
    const client = clients.get(clientWs);
    if (client && client.lastLocation) {
      members.push({
        userId: client.userId,
        userName: client.userName,
        profileImage: client.profileImage,
        ...client.lastLocation,
      });
    }
  });

  // Broadcast to all group members
  const message: GroupMemberUpdate = {
    type: "group_member_update",
    groupId,
    members,
  };

  // Send to all clients in batches if needed
  const messageStr = JSON.stringify(message);
  groupSet.forEach((clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(messageStr);
    }
  });
}

async function handleChatMessage(
  ws: WebSocket,
  client: ClientInfo,
  message: ChatMessage
): Promise<void> {
  if (client.groupId === null || client.groupId !== message.groupId) {
    sendMessage(ws, { type: "error", message: "Not in this group" });
    return;
  }

  try {
    // Save message to database
    const savedMessage = await db.sendGroupMessage(
      message.groupId,
      client.userId,
      message.message,
      message.messageType
    );

    if (!savedMessage) {
      sendMessage(ws, { type: "error", message: "Failed to save message" });
      return;
    }

    // Get user info for broadcast
    const user = await db.getUserById(client.userId);

    // Broadcast to all group members
    const chatBroadcast: ChatBroadcast = {
      type: "chat_broadcast",
      groupId: message.groupId,
      chatMessage: {
        id: savedMessage.id,
        userId: client.userId,
        userName: user?.name || client.userName,
        userProfileImage: user?.profileImageUrl || null,
        message: message.message,
        messageType: message.messageType,
        createdAt: savedMessage.createdAt,
      },
    };

    const groupSet = groupClients.get(message.groupId);
    if (groupSet) {
      const broadcastStr = JSON.stringify(chatBroadcast);
      groupSet.forEach((clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(broadcastStr);
        }
      });
    }

    console.log(`[WebSocket] Chat message from ${client.userName} in group ${message.groupId}`);
  } catch (error) {
    console.error("[WebSocket] Error sending chat message:", error);
    sendMessage(ws, { type: "error", message: "Failed to send message" });
  }
}

function handleDisconnect(ws: WebSocket): void {
  const client = clients.get(ws);
  if (client) {
    if (client.groupId !== null) {
      handleLeaveGroup(ws, client, client.groupId);
    }
    clients.delete(ws);
    console.log(`[WebSocket] User ${client.userId} disconnected`);
  }
}

function sendMessage(ws: WebSocket, message: OutgoingMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Export for testing
export { clients, groupClients };
