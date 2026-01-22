import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, ridingRecords, InsertRidingRecord, RidingRecord, scooters, InsertScooter, Scooter, posts, InsertPost, Post, comments, InsertComment, Comment, postLikes, InsertPostLike, PostLike, friendRequests, InsertFriendRequest, FriendRequest, friends, InsertFriend, Friend, follows, InsertFollow, Follow, postImages, InsertPostImage, PostImage, postViews, InsertPostView, PostView, notifications, InsertNotification, Notification, challenges, InsertChallenge, Challenge, challengeParticipants, InsertChallengeParticipant, ChallengeParticipant, liveLocations, InsertLiveLocation, LiveLocation, badges, InsertBadge, Badge, userBadges, InsertUserBadge, UserBadge, challengeInvitations, InsertChallengeInvitation, ChallengeInvitation } from "../drizzle/schema";
import { ENV } from "./_core/env";
import * as crypto from "crypto";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Password hashing utilities
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return hash === verifyHash;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "passwordHash", "googleId"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.emailVerified !== undefined) {
      values.emailVerified = user.emailVerified;
      updateSet.emailVerified = user.emailVerified;
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Email/Password Authentication Functions

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithEmail(
  email: string,
  password: string,
  name: string
): Promise<{ success: boolean; error?: string; userId?: number }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "데이터베이스에 연결할 수 없습니다." };
  }

  try {
    // Check if email already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return { success: false, error: "이미 사용 중인 이메일입니다." };
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Generate unique openId for email users
    const openId = `email_${crypto.randomBytes(16).toString("hex")}`;

    // Insert user
    const result = await db.insert(users).values({
      openId,
      email,
      name,
      passwordHash,
      loginMethod: "email",
      emailVerified: false,
      lastSignedIn: new Date(),
    });

    return { success: true, userId: result[0].insertId };
  } catch (error) {
    console.error("[Database] Failed to create user:", error);
    return { success: false, error: "회원가입 중 오류가 발생했습니다." };
  }
}

export async function verifyUserCredentials(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: typeof users.$inferSelect }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "데이터베이스에 연결할 수 없습니다." };
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }

    if (!user.passwordHash) {
      return { success: false, error: "이 계정은 다른 로그인 방식을 사용합니다." };
    }

    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }

    // Update last signed in
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

    return { success: true, user };
  } catch (error) {
    console.error("[Database] Failed to verify credentials:", error);
    return { success: false, error: "로그인 중 오류가 발생했습니다." };
  }
}

// Password Reset Functions

export async function storePasswordResetToken(userId: number, token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 1); // Token expires in 1 hour

  await db.update(users).set({
    passwordResetToken: token,
    passwordResetExpiry: expiry,
  }).where(eq(users.id, userId));
}

export async function updateUserPassword(
  email: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "데이터베이스에 연결할 수 없습니다." };
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return { success: false, error: "사용자를 찾을 수 없습니다." };
    }

    const passwordHash = hashPassword(newPassword);

    await db.update(users).set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    }).where(eq(users.id, user.id));

    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to update password:", error);
    return { success: false, error: "비밀번호 변경 중 오류가 발생했습니다." };
  }
}

// Google OAuth Functions

export async function getUserByGoogleId(googleId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithGoogle(
  googleId: string,
  email: string,
  name: string
): Promise<{ success: boolean; error?: string; userId?: number }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "데이터베이스에 연결할 수 없습니다." };
  }

  try {
    // Generate unique openId for Google users
    const openId = `google_${crypto.randomBytes(16).toString("hex")}`;

    // Insert user
    const result = await db.insert(users).values({
      openId,
      email,
      name,
      googleId,
      loginMethod: "google",
      emailVerified: true, // Google accounts are pre-verified
      lastSignedIn: new Date(),
    });

    return { success: true, userId: result[0].insertId };
  } catch (error) {
    console.error("[Database] Failed to create Google user:", error);
    return { success: false, error: "회원가입 중 오류가 발생했습니다." };
  }
}

export async function linkGoogleAccount(userId: number, googleId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(users).set({
    googleId,
    loginMethod: "google",
    lastSignedIn: new Date(),
  }).where(eq(users.id, userId));
}

// Riding Records Functions

export async function getUserRidingRecords(userId: number): Promise<RidingRecord[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(ridingRecords).where(eq(ridingRecords.userId, userId));
}

export async function createRidingRecord(data: InsertRidingRecord): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Remove undefined fields and ensure proper types
  const cleanData: Record<string, unknown> = {
    userId: data.userId,
    recordId: data.recordId,
    date: data.date,
    duration: data.duration,
    distance: data.distance,
    avgSpeed: data.avgSpeed,
    maxSpeed: data.maxSpeed,
  };
  
  if (data.startTime) cleanData.startTime = data.startTime;
  if (data.endTime) cleanData.endTime = data.endTime;
  if (data.gpsPointsJson) cleanData.gpsPointsJson = data.gpsPointsJson;
  if (data.scooterId) cleanData.scooterId = data.scooterId;

  const result = await db.insert(ridingRecords).values(cleanData as InsertRidingRecord);
  return result[0].insertId;
}

export async function deleteRidingRecord(recordId: string, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(ridingRecords)
    .where(eq(ridingRecords.recordId, recordId));
  return true;
}

// Scooter (기체) Management Functions

export async function getUserScooters(userId: number): Promise<Scooter[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(scooters).where(eq(scooters.userId, userId));
}

export async function getScooterById(scooterId: number, userId: number): Promise<Scooter | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(scooters)
    .where(and(eq(scooters.id, scooterId), eq(scooters.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createScooter(data: InsertScooter): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // If this is the first scooter for the user, make it default
  const existingScooters = await getUserScooters(data.userId);
  if (existingScooters.length === 0) {
    data.isDefault = true;
  }

  const result = await db.insert(scooters).values(data);
  return result[0].insertId;
}

export async function updateScooter(
  scooterId: number,
  userId: number,
  data: Partial<InsertScooter>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(scooters)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(scooters.id, scooterId), eq(scooters.userId, userId)));
  return true;
}

export async function deleteScooter(scooterId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(scooters)
    .where(and(eq(scooters.id, scooterId), eq(scooters.userId, userId)));
  return true;
}

export async function setDefaultScooter(scooterId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // First, unset all defaults for this user
  await db.update(scooters)
    .set({ isDefault: false })
    .where(eq(scooters.userId, userId));

  // Then set the new default
  await db.update(scooters)
    .set({ isDefault: true })
    .where(and(eq(scooters.id, scooterId), eq(scooters.userId, userId)));

  return true;
}

export async function updateScooterStats(
  scooterId: number,
  userId: number,
  distanceToAdd: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const scooter = await getScooterById(scooterId, userId);
  if (!scooter) return false;

  await db.update(scooters)
    .set({
      totalDistance: scooter.totalDistance + distanceToAdd,
      totalRides: scooter.totalRides + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(scooters.id, scooterId), eq(scooters.userId, userId)));

  return true;
}

export async function getDefaultScooter(userId: number): Promise<Scooter | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(scooters)
    .where(and(eq(scooters.userId, userId), eq(scooters.isDefault, true)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== Community Functions ====================

import { desc, sql } from "drizzle-orm";

export interface PostWithAuthor extends Post {
  authorName: string | null;
  authorEmail: string | null;
  isLiked?: boolean;
  imageUrls: string | null;
}

export interface CommentWithAuthor extends Comment {
  authorName: string | null;
  authorEmail: string | null;
}

export async function createPost(data: Omit<InsertPost, "id">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(posts).values(data);
  return result[0].insertId;
}

export async function getPosts(
  limit: number = 20,
  offset: number = 0,
  userId?: number
): Promise<PostWithAuthor[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      title: posts.title,
      content: posts.content,
      postType: posts.postType,
      ridingRecordId: posts.ridingRecordId,
      likeCount: posts.likeCount,
      commentCount: posts.commentCount,
      viewCount: posts.viewCount,
      imageUrls: posts.imageUrls,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

  // Check if user has liked each post
  if (userId) {
    const postsWithLikes = await Promise.all(
      result.map(async (post) => {
        const like = await db
          .select()
          .from(postLikes)
          .where(and(eq(postLikes.postId, post.id), eq(postLikes.userId, userId)))
          .limit(1);
        return { ...post, isLiked: like.length > 0 };
      })
    );
    return postsWithLikes;
  }

  return result;
}

export async function getPostById(postId: number, userId?: number): Promise<PostWithAuthor | null> {
  const db = await getDb();
  if (!db) return null;

  // Check if user has already viewed this post (only count once per user)
  if (userId) {
    const existingView = await db
      .select()
      .from(postViews)
      .where(and(eq(postViews.postId, postId), eq(postViews.userId, userId)))
      .limit(1);
    
    if (existingView.length === 0) {
      // First view by this user - record it and increment count
      await db.insert(postViews).values({ postId, userId });
      await db.update(posts)
        .set({ viewCount: sql`${posts.viewCount} + 1` })
        .where(eq(posts.id, postId));
    }
  }

  const result = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      title: posts.title,
      content: posts.content,
      postType: posts.postType,
      ridingRecordId: posts.ridingRecordId,
      likeCount: posts.likeCount,
      commentCount: posts.commentCount,
      viewCount: posts.viewCount,
      imageUrls: posts.imageUrls,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .where(eq(posts.id, postId))
    .limit(1);

  if (result.length === 0) return null;

  const post = result[0];

  // Check if user has liked the post
  if (userId) {
    const like = await db
      .select()
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
      .limit(1);
    return { ...post, isLiked: like.length > 0 };
  }

  return post;
}

export async function updatePost(
  postId: number,
  userId: number,
  data: Partial<Pick<InsertPost, "title" | "content" | "postType">>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(posts)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  return true;
}

export async function deletePost(postId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Delete comments first
  await db.delete(comments).where(eq(comments.postId, postId));
  // Delete likes
  await db.delete(postLikes).where(eq(postLikes.postId, postId));
  // Delete post
  await db.delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  return true;
}

export async function togglePostLike(postId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check if already liked
  const existingLike = await db
    .select()
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
    .limit(1);

  if (existingLike.length > 0) {
    // Unlike
    await db.delete(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    await db.update(posts)
      .set({ likeCount: sql`${posts.likeCount} - 1` })
      .where(eq(posts.id, postId));
    return false; // Now unliked
  } else {
    // Like
    await db.insert(postLikes).values({ postId, userId });
    await db.update(posts)
      .set({ likeCount: sql`${posts.likeCount} + 1` })
      .where(eq(posts.id, postId));
    return true; // Now liked
  }
}

// Comment functions
export async function createComment(data: Omit<InsertComment, "id">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(comments).values(data);
  
  // Update post comment count
  await db.update(posts)
    .set({ commentCount: sql`${posts.commentCount} + 1` })
    .where(eq(posts.id, data.postId));

  return result[0].insertId;
}

export async function getCommentsByPostId(postId: number): Promise<CommentWithAuthor[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: comments.id,
      postId: comments.postId,
      userId: comments.userId,
      content: comments.content,
      parentId: comments.parentId,
      likeCount: comments.likeCount,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.postId, postId))
    .orderBy(comments.createdAt);

  return result;
}

export async function deleteComment(commentId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get comment to find postId
  const comment = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
    .limit(1);

  if (comment.length === 0) return false;

  // Delete comment
  await db.delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId)));

  // Update post comment count
  await db.update(posts)
    .set({ commentCount: sql`${posts.commentCount} - 1` })
    .where(eq(posts.id, comment[0].postId));

  return true;
}

export async function getUserPosts(userId: number): Promise<PostWithAuthor[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      title: posts.title,
      content: posts.content,
      postType: posts.postType,
      ridingRecordId: posts.ridingRecordId,
      likeCount: posts.likeCount,
      commentCount: posts.commentCount,
      viewCount: posts.viewCount,
      imageUrls: posts.imageUrls,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(posts)
    .leftJoin(users, eq(posts.userId, users.id))
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt));

  return result;
}


// ==================== Friend Functions ====================

import { or, like, ne } from "drizzle-orm";

export interface UserWithFriendStatus {
  id: number;
  name: string | null;
  email: string | null;
  isFriend: boolean;
  hasPendingRequest: boolean;
  hasReceivedRequest: boolean;
}

export interface FriendRequestWithUser extends FriendRequest {
  senderName: string | null;
  senderEmail: string | null;
  receiverName: string | null;
  receiverEmail: string | null;
  message: string | null;
}

// Search users by name or email
export async function searchUsers(
  query: string,
  currentUserId: number,
  limit: number = 20
): Promise<UserWithFriendStatus[]> {
  const db = await getDb();
  if (!db) return [];

  const searchPattern = `%${query}%`;
  
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        ne(users.id, currentUserId),
        or(
          like(users.name, searchPattern),
          like(users.email, searchPattern)
        )
      )
    )
    .limit(limit);

  // Check friend status for each user
  const usersWithStatus = await Promise.all(
    result.map(async (user) => {
      const [userId1, userId2] = [currentUserId, user.id].sort((a, b) => a - b);
      
      // Check if already friends
      const friendship = await db
        .select()
        .from(friends)
        .where(and(eq(friends.userId1, userId1), eq(friends.userId2, userId2)))
        .limit(1);

      // Check pending requests
      const sentRequest = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.senderId, currentUserId),
            eq(friendRequests.receiverId, user.id),
            eq(friendRequests.status, "pending")
          )
        )
        .limit(1);

      const receivedRequest = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.senderId, user.id),
            eq(friendRequests.receiverId, currentUserId),
            eq(friendRequests.status, "pending")
          )
        )
        .limit(1);

      return {
        ...user,
        isFriend: friendship.length > 0,
        hasPendingRequest: sentRequest.length > 0,
        hasReceivedRequest: receivedRequest.length > 0,
      };
    })
  );

  return usersWithStatus;
}

// Send friend request
export async function sendFriendRequest(senderId: number, receiverId: number, message?: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Check if already friends
  const [userId1, userId2] = [senderId, receiverId].sort((a, b) => a - b);
  const existingFriend = await db
    .select()
    .from(friends)
    .where(and(eq(friends.userId1, userId1), eq(friends.userId2, userId2)))
    .limit(1);

  if (existingFriend.length > 0) return null;

  // Check if request already exists
  const existingRequest = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.senderId, senderId),
        eq(friendRequests.receiverId, receiverId),
        eq(friendRequests.status, "pending")
      )
    )
    .limit(1);

  if (existingRequest.length > 0) return null;

  const result = await db.insert(friendRequests).values({
    senderId,
    receiverId,
    message: message || null,
    status: "pending",
  });

  return result[0].insertId;
}

// Get pending friend requests (received)
export async function getPendingFriendRequests(userId: number): Promise<FriendRequestWithUser[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: friendRequests.id,
      senderId: friendRequests.senderId,
      receiverId: friendRequests.receiverId,
      message: friendRequests.message,
      status: friendRequests.status,
      createdAt: friendRequests.createdAt,
      updatedAt: friendRequests.updatedAt,
      senderName: users.name,
      senderEmail: users.email,
    })
    .from(friendRequests)
    .leftJoin(users, eq(friendRequests.senderId, users.id))
    .where(
      and(
        eq(friendRequests.receiverId, userId),
        eq(friendRequests.status, "pending")
      )
    )
    .orderBy(desc(friendRequests.createdAt));

  return result.map(r => ({
    ...r,
    receiverName: null,
    receiverEmail: null,
  }));
}

// Get sent friend requests
export async function getSentFriendRequests(userId: number): Promise<FriendRequestWithUser[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: friendRequests.id,
      senderId: friendRequests.senderId,
      receiverId: friendRequests.receiverId,
      message: friendRequests.message,
      status: friendRequests.status,
      createdAt: friendRequests.createdAt,
      updatedAt: friendRequests.updatedAt,
      receiverName: users.name,
      receiverEmail: users.email,
    })
    .from(friendRequests)
    .leftJoin(users, eq(friendRequests.receiverId, users.id))
    .where(
      and(
        eq(friendRequests.senderId, userId),
        eq(friendRequests.status, "pending")
      )
    )
    .orderBy(desc(friendRequests.createdAt));

  return result.map(r => ({
    ...r,
    senderName: null,
    senderEmail: null,
  }));
}

// Accept friend request
export async function acceptFriendRequest(requestId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get the request
  const request = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.id, requestId),
        eq(friendRequests.receiverId, userId),
        eq(friendRequests.status, "pending")
      )
    )
    .limit(1);

  if (request.length === 0) return false;

  // Update request status
  await db.update(friendRequests)
    .set({ status: "accepted" })
    .where(eq(friendRequests.id, requestId));

  // Create friendship (always store smaller ID first)
  const [userId1, userId2] = [request[0].senderId, userId].sort((a, b) => a - b);
  await db.insert(friends).values({ userId1, userId2 });

  return true;
}

// Reject friend request
export async function rejectFriendRequest(requestId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(friendRequests)
    .set({ status: "rejected" })
    .where(
      and(
        eq(friendRequests.id, requestId),
        eq(friendRequests.receiverId, userId)
      )
    );

  return true;
}

// Get friends list
export async function getFriends(userId: number): Promise<{ id: number; name: string | null; email: string | null; profileImageUrl: string | null }[]> {
  const db = await getDb();
  if (!db) return [];

  // Get friendships where user is userId1
  const friends1 = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
    })
    .from(friends)
    .innerJoin(users, eq(friends.userId2, users.id))
    .where(eq(friends.userId1, userId));

  // Get friendships where user is userId2
  const friends2 = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
    })
    .from(friends)
    .innerJoin(users, eq(friends.userId1, users.id))
    .where(eq(friends.userId2, userId));

  return [...friends1, ...friends2];
}

// Remove friend
export async function removeFriend(userId: number, friendId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [userId1, userId2] = [userId, friendId].sort((a, b) => a - b);
  
  await db.delete(friends)
    .where(and(eq(friends.userId1, userId1), eq(friends.userId2, userId2)));

  return true;
}

// ==================== Follow Functions ====================

// Follow a user
export async function followUser(followerId: number, followingId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check if already following
  const existing = await db
    .select()
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    .limit(1);

  if (existing.length > 0) return false;

  await db.insert(follows).values({ followerId, followingId });
  return true;
}

// Unfollow a user
export async function unfollowUser(followerId: number, followingId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));

  return true;
}

// Get followers
export async function getFollowers(userId: number): Promise<{ id: number; name: string | null; email: string | null }[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followerId, users.id))
    .where(eq(follows.followingId, userId));

  return result;
}

// Get following
export async function getFollowing(userId: number): Promise<{ id: number; name: string | null; email: string | null }[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followingId, users.id))
    .where(eq(follows.followerId, userId));

  return result;
}

// Check if following
export async function isFollowing(followerId: number, followingId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    .limit(1);

  return result.length > 0;
}

// Get follow counts
export async function getFollowCounts(userId: number): Promise<{ followers: number; following: number }> {
  const db = await getDb();
  if (!db) return { followers: 0, following: 0 };

  const followers = await db
    .select()
    .from(follows)
    .where(eq(follows.followingId, userId));

  const following = await db
    .select()
    .from(follows)
    .where(eq(follows.followerId, userId));

  return {
    followers: followers.length,
    following: following.length,
  };
}

// ==================== Post Image Functions ====================

// Add image to post
export async function addPostImage(postId: number, imageUrl: string, orderIndex: number = 0): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(postImages).values({ postId, imageUrl, orderIndex });
  return result[0].insertId;
}

// Get post images
export async function getPostImages(postId: number): Promise<PostImage[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(postImages)
    .where(eq(postImages.postId, postId))
    .orderBy(postImages.orderIndex);

  return result;
}

// Delete post images
export async function deletePostImages(postId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(postImages).where(eq(postImages.postId, postId));
  return true;
}

// ==================== Ranking Functions ====================

export interface RankingUser {
  userId: number;
  name: string | null;
  email: string | null;
  totalDistance: number;
  totalRides: number;
  rank: number;
}

// Get weekly/monthly ranking
export async function getRanking(
  period: "weekly" | "monthly",
  limit: number = 50
): Promise<RankingUser[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  let startDate: Date;

  if (period === "weekly") {
    // Start of current week (Monday)
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff));
    startDate.setHours(0, 0, 0, 0);
  } else {
    // Start of current month
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Get all riding records in the period
  const records = await db
    .select({
      userId: ridingRecords.userId,
      distance: ridingRecords.distance,
    })
    .from(ridingRecords)
    .where(
      and(
        sql`${ridingRecords.createdAt} >= ${startDate}`,
        sql`${ridingRecords.userId} IS NOT NULL`
      )
    );

  // Aggregate by user
  const userStats = new Map<number, { totalDistance: number; totalRides: number }>();
  
  for (const record of records) {
    if (!record.userId) continue;
    const existing = userStats.get(record.userId) || { totalDistance: 0, totalRides: 0 };
    userStats.set(record.userId, {
      totalDistance: existing.totalDistance + record.distance,
      totalRides: existing.totalRides + 1,
    });
  }

  // Get user info and sort by distance
  const userIds = Array.from(userStats.keys());
  if (userIds.length === 0) return [];

  const userInfos = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);

  const ranking: RankingUser[] = userInfos
    .map((user) => {
      const stats = userStats.get(user.id) || { totalDistance: 0, totalRides: 0 };
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        totalDistance: stats.totalDistance,
        totalRides: stats.totalRides,
        rank: 0,
      };
    })
    .sort((a, b) => b.totalDistance - a.totalDistance)
    .slice(0, limit)
    .map((user, index) => ({ ...user, rank: index + 1 }));

  return ranking;
}


// ==================== Profile Functions ====================

// Update user profile
export async function updateUserProfile(
  userId: number,
  data: { name?: string; profileImageUrl?: string | null }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId));
  
  return true;
}

// Get user by ID
export async function getUserById(userId: number): Promise<{
  id: number;
  name: string | null;
  email: string | null;
  profileImageUrl: string | null;
  createdAt: Date;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] || null;
}


// ==================== Notification Functions ====================

export interface NotificationWithActor extends Notification {
  actorName: string | null;
  actorProfileImageUrl: string | null;
}

// Create notification
export async function createNotification(data: {
  userId: number;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
  actorId?: number;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(notifications).values({
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body || null,
    entityType: data.entityType || null,
    entityId: data.entityId || null,
    actorId: data.actorId || null,
    isRead: false,
  });

  return result[0].insertId;
}

// Get user notifications
export async function getUserNotifications(
  userId: number,
  limit: number = 50
): Promise<NotificationWithActor[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      entityType: notifications.entityType,
      entityId: notifications.entityId,
      actorId: notifications.actorId,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      actorName: users.name,
      actorProfileImageUrl: users.profileImageUrl,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return result;
}

// Mark notification as read
export async function markNotificationAsRead(notificationId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

  return true;
}

// Mark all notifications as read
export async function markAllNotificationsAsRead(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));

  return true;
}

// Get unread notification count
export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  return result.length;
}

// ==================== Challenge Functions ====================

export interface ChallengeWithCreator extends Challenge {
  creatorName: string | null;
  participantCount: number;
  userProgress?: number;
  userCompleted?: boolean;
}

// Create challenge
export async function createChallenge(data: {
  creatorId: number;
  title: string;
  description?: string;
  type: string;
  targetValue: number;
  startDate: Date;
  endDate: Date;
  isPublic?: boolean;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(challenges).values({
    creatorId: data.creatorId,
    title: data.title,
    description: data.description || null,
    type: data.type,
    targetValue: data.targetValue.toString(),
    startDate: data.startDate,
    endDate: data.endDate,
    isPublic: data.isPublic ?? true,
  });

  // Auto-join creator
  const challengeId = result[0].insertId;
  await db.insert(challengeParticipants).values({
    challengeId,
    userId: data.creatorId,
    progress: "0",
    isCompleted: false,
  });

  return challengeId;
}

// Get public challenges
export async function getPublicChallenges(userId: number, limit: number = 20): Promise<ChallengeWithCreator[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();

  const result = await db
    .select({
      id: challenges.id,
      creatorId: challenges.creatorId,
      title: challenges.title,
      description: challenges.description,
      type: challenges.type,
      targetValue: challenges.targetValue,
      startDate: challenges.startDate,
      endDate: challenges.endDate,
      isPublic: challenges.isPublic,
      createdAt: challenges.createdAt,
      updatedAt: challenges.updatedAt,
      creatorName: users.name,
    })
    .from(challenges)
    .leftJoin(users, eq(challenges.creatorId, users.id))
    .where(
      and(
        eq(challenges.isPublic, true),
        sql`${challenges.endDate} >= ${now}`
      )
    )
    .orderBy(desc(challenges.createdAt))
    .limit(limit);

  // Get participant counts and user progress
  const challengesWithCounts = await Promise.all(
    result.map(async (challenge) => {
      const participants = await db
        .select()
        .from(challengeParticipants)
        .where(eq(challengeParticipants.challengeId, challenge.id));

      const userParticipant = participants.find(p => p.userId === userId);

      return {
        ...challenge,
        participantCount: participants.length,
        userProgress: userParticipant ? parseFloat(userParticipant.progress) : undefined,
        userCompleted: userParticipant?.isCompleted,
      };
    })
  );

  return challengesWithCounts;
}

// Join challenge
export async function joinChallenge(challengeId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check if already joined
  const existing = await db
    .select()
    .from(challengeParticipants)
    .where(and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.userId, userId)))
    .limit(1);

  if (existing.length > 0) return false;

  await db.insert(challengeParticipants).values({
    challengeId,
    userId,
    progress: "0",
    isCompleted: false,
  });

  return true;
}

// Update challenge progress
export async function updateChallengeProgress(
  challengeId: number,
  userId: number,
  progress: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get challenge target
  const challenge = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (challenge.length === 0) return false;

  const targetValue = parseFloat(challenge[0].targetValue);
  const isCompleted = progress >= targetValue;

  await db.update(challengeParticipants)
    .set({
      progress: progress.toString(),
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
    })
    .where(and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.userId, userId)));

  return true;
}

// Get user's challenges
export async function getUserChallenges(userId: number): Promise<ChallengeWithCreator[]> {
  const db = await getDb();
  if (!db) return [];

  const userParticipations = await db
    .select()
    .from(challengeParticipants)
    .where(eq(challengeParticipants.userId, userId));

  if (userParticipations.length === 0) return [];

  const challengeIds = userParticipations.map(p => p.challengeId);

  const result = await db
    .select({
      id: challenges.id,
      creatorId: challenges.creatorId,
      title: challenges.title,
      description: challenges.description,
      type: challenges.type,
      targetValue: challenges.targetValue,
      startDate: challenges.startDate,
      endDate: challenges.endDate,
      isPublic: challenges.isPublic,
      createdAt: challenges.createdAt,
      updatedAt: challenges.updatedAt,
      creatorName: users.name,
    })
    .from(challenges)
    .leftJoin(users, eq(challenges.creatorId, users.id))
    .where(sql`${challenges.id} IN (${sql.join(challengeIds.map(id => sql`${id}`), sql`, `)})`);

  // Add user progress
  const challengesWithProgress = result.map((challenge) => {
    const participation = userParticipations.find(p => p.challengeId === challenge.id);
    return {
      ...challenge,
      participantCount: 0,
      userProgress: participation ? parseFloat(participation.progress) : 0,
      userCompleted: participation?.isCompleted || false,
    };
  });

  return challengesWithProgress;
}

// Get challenge leaderboard
export async function getChallengeLeaderboard(challengeId: number): Promise<{
  userId: number;
  name: string | null;
  progress: number;
  isCompleted: boolean;
  rank: number;
}[]> {
  const db = await getDb();
  if (!db) return [];

  const participants = await db
    .select({
      userId: challengeParticipants.userId,
      progress: challengeParticipants.progress,
      isCompleted: challengeParticipants.isCompleted,
      name: users.name,
    })
    .from(challengeParticipants)
    .leftJoin(users, eq(challengeParticipants.userId, users.id))
    .where(eq(challengeParticipants.challengeId, challengeId));

  return participants
    .map(p => ({
      userId: p.userId,
      name: p.name,
      progress: parseFloat(p.progress),
      isCompleted: p.isCompleted,
      rank: 0,
    }))
    .sort((a, b) => b.progress - a.progress)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}


// ==================== Live Location Functions ====================

// Update or create live location
export async function updateLiveLocation(
  userId: number,
  latitude: number,
  longitude: number,
  heading: number | null,
  speed: number | null,
  isRiding: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Try to update existing record
  const existing = await db
    .select()
    .from(liveLocations)
    .where(eq(liveLocations.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(liveLocations)
      .set({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        heading: heading?.toString() || null,
        speed: speed?.toString() || null,
        isRiding,
      })
      .where(eq(liveLocations.userId, userId));
  } else {
    await db.insert(liveLocations).values({
      userId,
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      heading: heading?.toString() || null,
      speed: speed?.toString() || null,
      isRiding,
    });
  }
}

// Stop sharing location
export async function stopLiveLocation(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(liveLocations)
    .set({ isRiding: false })
    .where(eq(liveLocations.userId, userId));
}

// Get friends' live locations
export async function getFriendsLiveLocations(userId: number): Promise<{
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updatedAt: Date;
}[]> {
  const db = await getDb();
  if (!db) return [];

  // Get friend IDs (friends table uses userId1/userId2 where userId1 < userId2)
  const friendsList1 = await db
    .select({ friendId: friends.userId2 })
    .from(friends)
    .where(eq(friends.userId1, userId));

  const friendsList2 = await db
    .select({ friendId: friends.userId1 })
    .from(friends)
    .where(eq(friends.userId2, userId));

  const friendIds = [
    ...friendsList1.map(f => f.friendId),
    ...friendsList2.map(f => f.friendId),
  ];

  if (friendIds.length === 0) return [];

  // Get live locations of friends who are riding
  const locations = await db
    .select({
      userId: liveLocations.userId,
      latitude: liveLocations.latitude,
      longitude: liveLocations.longitude,
      heading: liveLocations.heading,
      speed: liveLocations.speed,
      updatedAt: liveLocations.updatedAt,
      name: users.name,
      profileImageUrl: users.profileImageUrl,
    })
    .from(liveLocations)
    .leftJoin(users, eq(liveLocations.userId, users.id))
    .where(and(
      eq(liveLocations.isRiding, true),
      sql`${liveLocations.userId} IN (${sql.join(friendIds.map(id => sql`${id}`), sql`, `)})`
    ));

  return locations.map(loc => ({
    userId: loc.userId,
    name: loc.name,
    profileImageUrl: loc.profileImageUrl,
    latitude: parseFloat(loc.latitude),
    longitude: parseFloat(loc.longitude),
    heading: loc.heading ? parseFloat(loc.heading) : null,
    speed: loc.speed ? parseFloat(loc.speed) : null,
    updatedAt: loc.updatedAt,
  }));
}

// ==================== Badge Functions ====================

// Get all badges
export async function getAllBadges(): Promise<Badge[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(badges);
}

// Get user's earned badges
export async function getUserBadges(userId: number): Promise<{
  badge: Badge;
  earnedAt: Date;
}[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      badge: badges,
      earnedAt: userBadges.earnedAt,
    })
    .from(userBadges)
    .innerJoin(badges, eq(userBadges.badgeId, badges.id))
    .where(eq(userBadges.userId, userId));

  return result;
}

// Award badge to user
export async function awardBadge(userId: number, badgeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check if already earned
  const existing = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(userBadges).values({ userId, badgeId });
  }
}

// Check and award badges based on user stats
export async function checkAndAwardBadges(userId: number, totalDistance: number, totalRides: number): Promise<Badge[]> {
  const db = await getDb();
  if (!db) return [];

  const allBadges = await getAllBadges();
  const earnedBadges = await getUserBadges(userId);
  const earnedBadgeIds = new Set(earnedBadges.map(eb => eb.badge.id));
  const newBadges: Badge[] = [];

  for (const badge of allBadges) {
    if (earnedBadgeIds.has(badge.id)) continue;

    let qualified = false;
    const requirement = parseFloat(badge.requirement);

    switch (badge.category) {
      case "distance":
        qualified = totalDistance >= requirement * 1000; // km to m
        break;
      case "rides":
        qualified = totalRides >= requirement;
        break;
    }

    if (qualified) {
      await awardBadge(userId, badge.id);
      newBadges.push(badge);
    }
  }

  return newBadges;
}

// ==================== Challenge Invitation Functions ====================

// Send challenge invitation
export async function sendChallengeInvitation(
  challengeId: number,
  inviterId: number,
  inviteeId: number
): Promise<ChallengeInvitation | null> {
  const db = await getDb();
  if (!db) return null;

  // Check if already invited
  const existing = await db
    .select()
    .from(challengeInvitations)
    .where(and(
      eq(challengeInvitations.challengeId, challengeId),
      eq(challengeInvitations.inviteeId, inviteeId)
    ))
    .limit(1);

  if (existing.length > 0) return null;

  const result = await db.insert(challengeInvitations).values({
    challengeId,
    inviterId,
    inviteeId,
  });

  const insertId = result[0].insertId;
  const invitation = await db
    .select()
    .from(challengeInvitations)
    .where(eq(challengeInvitations.id, insertId))
    .limit(1);

  return invitation[0] || null;
}

// Get pending challenge invitations for user
export async function getPendingChallengeInvitations(userId: number): Promise<{
  invitation: ChallengeInvitation;
  challenge: Challenge;
  inviterName: string | null;
}[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      invitation: challengeInvitations,
      challenge: challenges,
      inviterName: users.name,
    })
    .from(challengeInvitations)
    .innerJoin(challenges, eq(challengeInvitations.challengeId, challenges.id))
    .leftJoin(users, eq(challengeInvitations.inviterId, users.id))
    .where(and(
      eq(challengeInvitations.inviteeId, userId),
      eq(challengeInvitations.status, "pending")
    ));

  return result;
}

// Respond to challenge invitation
export async function respondToChallengeInvitation(
  invitationId: number,
  userId: number,
  accept: boolean
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const invitation = await db
    .select()
    .from(challengeInvitations)
    .where(and(
      eq(challengeInvitations.id, invitationId),
      eq(challengeInvitations.inviteeId, userId)
    ))
    .limit(1);

  if (invitation.length === 0) return false;

  await db
    .update(challengeInvitations)
    .set({
      status: accept ? "accepted" : "declined",
      respondedAt: new Date(),
    })
    .where(eq(challengeInvitations.id, invitationId));

  if (accept) {
    // Join the challenge
    await joinChallenge(invitation[0].challengeId, userId);
  }

  return true;
}


// ==================== Friend Stats Functions ====================

export interface FriendStats {
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  totalDistance: number;
  totalRides: number;
  totalDuration: number;
  avgSpeed: number;
}

// Get friend's riding stats
export async function getFriendStats(userId: number, friendId: number): Promise<FriendStats | null> {
  const db = await getDb();
  if (!db) return null;

  // Verify they are friends
  const areFriends = await checkFriendship(userId, friendId);
  if (!areFriends) return null;

  // Get friend's user info
  const friendInfo = await db
    .select({
      id: users.id,
      name: users.name,
      profileImageUrl: users.profileImageUrl,
    })
    .from(users)
    .where(eq(users.id, friendId))
    .limit(1);

  if (friendInfo.length === 0) return null;

  // Get friend's riding records
  const records = await db
    .select({
      distance: ridingRecords.distance,
      duration: ridingRecords.duration,
      avgSpeed: ridingRecords.avgSpeed,
    })
    .from(ridingRecords)
    .where(eq(ridingRecords.userId, friendId));

  const totalDistance = records.reduce((sum, r) => sum + r.distance, 0);
  const totalRides = records.length;
  const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
  const avgSpeed = totalRides > 0 
    ? records.reduce((sum, r) => sum + r.avgSpeed, 0) / totalRides 
    : 0;

  return {
    userId: friendInfo[0].id,
    name: friendInfo[0].name,
    profileImageUrl: friendInfo[0].profileImageUrl,
    totalDistance,
    totalRides,
    totalDuration,
    avgSpeed,
  };
}

// Get current user's stats
export async function getUserStats(userId: number): Promise<FriendStats | null> {
  const db = await getDb();
  if (!db) return null;

  // Get user info
  const userInfo = await db
    .select({
      id: users.id,
      name: users.name,
      profileImageUrl: users.profileImageUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userInfo.length === 0) return null;

  // Get user's riding records
  const records = await db
    .select({
      distance: ridingRecords.distance,
      duration: ridingRecords.duration,
      avgSpeed: ridingRecords.avgSpeed,
    })
    .from(ridingRecords)
    .where(eq(ridingRecords.userId, userId));

  const totalDistance = records.reduce((sum, r) => sum + r.distance, 0);
  const totalRides = records.length;
  const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
  const avgSpeed = totalRides > 0 
    ? records.reduce((sum, r) => sum + r.avgSpeed, 0) / totalRides 
    : 0;

  return {
    userId: userInfo[0].id,
    name: userInfo[0].name,
    profileImageUrl: userInfo[0].profileImageUrl,
    totalDistance,
    totalRides,
    totalDuration,
    avgSpeed,
  };
}

// Check if two users are friends
async function checkFriendship(userId1: number, userId2: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [smaller, larger] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
  
  const result = await db
    .select()
    .from(friends)
    .where(and(eq(friends.userId1, smaller), eq(friends.userId2, larger)))
    .limit(1);

  return result.length > 0;
}
