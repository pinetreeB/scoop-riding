import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, ridingRecords, InsertRidingRecord, RidingRecord, scooters, InsertScooter, Scooter, posts, InsertPost, Post, comments, InsertComment, Comment, postLikes, InsertPostLike, PostLike, friendRequests, InsertFriendRequest, FriendRequest, friends, InsertFriend, Friend, follows, InsertFollow, Follow, postImages, InsertPostImage, PostImage } from "../drizzle/schema";
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

  const result = await db.insert(ridingRecords).values(data);
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

  // Increment view count
  await db.update(posts)
    .set({ viewCount: sql`${posts.viewCount} + 1` })
    .where(eq(posts.id, postId));

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
export async function sendFriendRequest(senderId: number, receiverId: number): Promise<number | null> {
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
export async function getFriends(userId: number): Promise<{ id: number; name: string | null; email: string | null }[]> {
  const db = await getDb();
  if (!db) return [];

  // Get friendships where user is userId1
  const friends1 = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
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
