/**
 * WebSocket server for real-time group riding location sharing
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

type IncomingMessage = LocationUpdate | JoinGroup | LeaveGroup | ChatMessage;
type OutgoingMessage = GroupMemberUpdate | ErrorMessage | ChatBroadcast | { type: "joined"; groupId: number; userId: number };

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
}

const clients = new Map<WebSocket, ClientInfo>();
const groupClients = new Map<number, Set<WebSocket>>(); // groupId -> Set of WebSocket clients

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ 
    server,
    path: "/ws/group-riding"
  });

  console.log("[WebSocket] Server initialized on /ws/group-riding");

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
  });
}

async function handleMessage(ws: WebSocket, message: IncomingMessage): Promise<void> {
  const client = clients.get(ws);
  if (!client) return;

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

    console.log(`[WebSocket] User ${client.userId} (${client.userName}) joined group ${message.groupId}`);

    // Send confirmation
    sendMessage(ws, { 
      type: "joined", 
      groupId: message.groupId,
      userId: client.userId 
    });

    // Send current group members' locations to the new member
    broadcastGroupLocations(message.groupId);
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
    }
  }

  console.log(`[WebSocket] User ${client.userId} left group ${groupId}`);
  
  client.groupId = null;
  client.lastLocation = null;

  // Broadcast updated member list to remaining group members
  broadcastGroupLocations(groupId);
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

  // Broadcast to all group members
  broadcastGroupLocations(message.groupId);
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
      groupSet.forEach((clientWs) => {
        sendMessage(clientWs, chatBroadcast);
      });
    }

    console.log(`[WebSocket] Chat message from ${client.userName} in group ${message.groupId}`);
  } catch (error) {
    console.error("[WebSocket] Error sending chat message:", error);
    sendMessage(ws, { type: "error", message: "Failed to send message" });
  }
}

function broadcastGroupLocations(groupId: number): void {
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

  groupSet.forEach((clientWs) => {
    sendMessage(clientWs, message);
  });
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
