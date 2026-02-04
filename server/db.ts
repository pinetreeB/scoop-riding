import { eq, and, desc, sql, gt, lt, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, ridingRecords, InsertRidingRecord, RidingRecord, scooters, InsertScooter, Scooter, posts, InsertPost, Post, comments, InsertComment, Comment, postLikes, InsertPostLike, PostLike, friendRequests, InsertFriendRequest, FriendRequest, friends, InsertFriend, Friend, follows, InsertFollow, Follow, postImages, InsertPostImage, PostImage, postViews, InsertPostView, PostView, notifications, InsertNotification, Notification, challenges, InsertChallenge, Challenge, challengeParticipants, InsertChallengeParticipant, ChallengeParticipant, liveLocations, InsertLiveLocation, LiveLocation, badges, InsertBadge, Badge, userBadges, InsertUserBadge, UserBadge, challengeInvitations, InsertChallengeInvitation, ChallengeInvitation, appVersions, InsertAppVersion, AppVersion, groupSessions, InsertGroupSession, GroupSession, groupMembers, InsertGroupMember, GroupMember, groupMessages, InsertGroupMessage, GroupMessage, announcements, InsertAnnouncement, Announcement, userAnnouncementReads, InsertUserAnnouncementRead, UserAnnouncementRead, userBans, InsertUserBan, UserBan, surveyResponses, InsertSurveyResponse, SurveyResponse, bugReports, InsertBugReport, BugReport, userActivityLogs, InsertUserActivityLog, UserActivityLog, suspiciousUserReports, InsertSuspiciousUserReport, SuspiciousUserReport, aiChatUsage, AiChatUsage, aiChatHistory, AiChatHistoryRecord, batteryAnalysis, BatteryAnalysisRecord, chargingRecords, ChargingRecord, InsertChargingRecord, maintenanceItems, MaintenanceItem, InsertMaintenanceItem, maintenanceRecords, MaintenanceRecord, InsertMaintenanceRecord, batteryHealthReports, BatteryHealthReport, InsertBatteryHealthReport } from "../drizzle/schema";
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

  // Build insert data with only defined fields
  const insertData: InsertRidingRecord = {
    userId: data.userId,
    recordId: data.recordId,
    date: data.date,
    duration: data.duration,
    distance: data.distance,
    avgSpeed: data.avgSpeed,
    maxSpeed: data.maxSpeed,
  };
  
  // Only add optional fields if they have values
  if (data.startTime !== undefined && data.startTime !== null) {
    insertData.startTime = data.startTime;
  }
  if (data.endTime !== undefined && data.endTime !== null) {
    insertData.endTime = data.endTime;
  }
  if (data.gpsPointsJson !== undefined && data.gpsPointsJson !== null) {
    insertData.gpsPointsJson = data.gpsPointsJson;
  }
  if (data.scooterId !== undefined && data.scooterId !== null) {
    insertData.scooterId = data.scooterId;
  }
  // Battery voltage fields
  if (data.voltageStart !== undefined && data.voltageStart !== null) {
    insertData.voltageStart = data.voltageStart;
  }
  if (data.voltageEnd !== undefined && data.voltageEnd !== null) {
    insertData.voltageEnd = data.voltageEnd;
  }
  if (data.socStart !== undefined && data.socStart !== null) {
    insertData.socStart = data.socStart;
  }
  if (data.socEnd !== undefined && data.socEnd !== null) {
    insertData.socEnd = data.socEnd;
  }
  if (data.temperature !== undefined && data.temperature !== null) {
    insertData.temperature = data.temperature;
  }
  // Weather fields
  if (data.humidity !== undefined && data.humidity !== null) {
    insertData.humidity = data.humidity;
  }
  if (data.windSpeed !== undefined && data.windSpeed !== null) {
    insertData.windSpeed = data.windSpeed;
  }
  if (data.windDirection !== undefined && data.windDirection !== null) {
    insertData.windDirection = data.windDirection;
  }
  if (data.precipitationType !== undefined && data.precipitationType !== null) {
    insertData.precipitationType = data.precipitationType;
  }
  if (data.weatherCondition !== undefined && data.weatherCondition !== null) {
    insertData.weatherCondition = data.weatherCondition;
  }

  const result = await db.insert(ridingRecords).values(insertData);
  return result[0].insertId;
}

export async function deleteRidingRecord(recordId: string, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(ridingRecords)
    .where(eq(ridingRecords.recordId, recordId));
  return true;
}

export async function getRidingRecordById(recordId: string): Promise<RidingRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const results = await db.select().from(ridingRecords).where(eq(ridingRecords.recordId, recordId));
  return results[0];
}

export async function getRidingRecordByRecordId(recordId: string, userId: number): Promise<RidingRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const results = await db.select().from(ridingRecords).where(
    and(eq(ridingRecords.recordId, recordId), eq(ridingRecords.userId, userId))
  );
  return results[0];
}

// Check for duplicate record by startTime (within tolerance seconds)
export async function getRidingRecordByStartTime(
  userId: number,
  startTime: Date,
  toleranceSeconds: number = 60
): Promise<RidingRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Calculate time range
  const minTime = new Date(startTime.getTime() - toleranceSeconds * 1000);
  const maxTime = new Date(startTime.getTime() + toleranceSeconds * 1000);

  const results = await db.select().from(ridingRecords).where(
    and(
      eq(ridingRecords.userId, userId),
      gt(ridingRecords.startTime, minTime),
      lt(ridingRecords.startTime, maxTime)
    )
  ).limit(1);
  
  return results[0];
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

/**
 * Recalculate scooter stats from riding records
 * This is used to fix stats for rides that were recorded before the stats update was implemented
 */
export async function recalculateScooterStats(
  scooterId: number,
  userId: number
): Promise<{ totalRides: number; totalDistance: number } | null> {
  const db = await getDb();
  if (!db) return null;

  // Get all riding records for this scooter
  const records = await db.select({
    distance: ridingRecords.distance,
  }).from(ridingRecords)
    .where(and(
      eq(ridingRecords.userId, userId),
      eq(ridingRecords.scooterId, scooterId)
    ));

  const totalRides = records.length;
  const totalDistance = records.reduce((sum, r) => sum + (r.distance || 0), 0);

  // Update scooter with recalculated stats
  await db.update(scooters)
    .set({
      totalRides,
      totalDistance,
      updatedAt: new Date(),
    })
    .where(and(eq(scooters.id, scooterId), eq(scooters.userId, userId)));

  console.log(`[DB] Recalculated stats for scooter ${scooterId}: ${totalRides} rides, ${totalDistance}m`);
  return { totalRides, totalDistance };
}

/**
 * Recalculate stats for all scooters of a user
 */
export async function recalculateAllScooterStats(
  userId: number
): Promise<{ scooterId: number; totalRides: number; totalDistance: number }[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all scooters for this user
  const userScooters = await db.select().from(scooters)
    .where(eq(scooters.userId, userId));

  const results: { scooterId: number; totalRides: number; totalDistance: number }[] = [];

  for (const scooter of userScooters) {
    const stats = await recalculateScooterStats(scooter.id, userId);
    if (stats) {
      results.push({ scooterId: scooter.id, ...stats });
    }
  }

  return results;
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

  // Check if user has liked each post - optimized single query
  if (userId && result.length > 0) {
    // Get all post IDs
    const postIds = result.map(post => post.id);
    
    // Single query to get all likes for these posts by this user
    const userLikes = await db
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(
        and(
          sql`${postLikes.postId} IN (${sql.join(postIds.map(id => sql`${id}`), sql`, `)})`,
          eq(postLikes.userId, userId)
        )
      );
    
    // Create a Set for O(1) lookup
    const likedPostIds = new Set(userLikes.map(like => like.postId));
    
    // Map results with isLiked flag
    return result.map(post => ({
      ...post,
      isLiked: likedPostIds.has(post.id)
    }));
  }

  return result.map(post => ({ ...post, isLiked: false }));
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
  data: { name?: string; profileImageUrl?: string | null; profileColor?: string }
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    return true;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return false;
  }
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
  // Only show locations updated within the last 30 minutes (1800 seconds)
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
      sql`${liveLocations.userId} IN (${sql.join(friendIds.map(id => sql`${id}`), sql`, `)})`,
      sql`${liveLocations.updatedAt} > DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
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
  // avgSpeed is stored as value * 10 in DB, so divide by 10 to get actual value
  const avgSpeed = totalRides > 0 
    ? records.reduce((sum, r) => sum + (r.avgSpeed / 10), 0) / totalRides 
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
  // avgSpeed is stored as value * 10 in DB, so divide by 10 to get actual value
  const avgSpeed = totalRides > 0 
    ? records.reduce((sum, r) => sum + (r.avgSpeed / 10), 0) / totalRides 
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


// App Version Management Functions

export async function getLatestAppVersion(platform: string = "android"): Promise<AppVersion | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Try with platform filter first
    const result = await db
      .select()
      .from(appVersions)
      .where(eq(appVersions.isActive, true))
      .orderBy(desc(appVersions.versionCode))
      .limit(1);

    console.log("[DB] getLatestAppVersion result:", result);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[DB] getLatestAppVersion error:", error);
    return null;
  }
}

export async function createAppVersion(data: InsertAppVersion): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(appVersions).values(data);
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Failed to create app version:", error);
    return null;
  }
}

export async function updateAppVersion(
  id: number,
  data: Partial<InsertAppVersion>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(appVersions).set(data).where(eq(appVersions.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update app version:", error);
    return false;
  }
}

export async function getAllAppVersions(platform: string = "android"): Promise<AppVersion[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(appVersions)
    .where(eq(appVersions.platform, platform))
    .orderBy(desc(appVersions.versionCode));
}


// ==================== Group Riding Functions ====================

// Generate 6-character group code
function generateGroupCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a new group session
export async function createGroupSession(hostId: number, name: string): Promise<{ groupId: number; code: string } | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Generate unique code
    let code = generateGroupCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.select().from(groupSessions).where(eq(groupSessions.code, code)).limit(1);
      if (existing.length === 0) break;
      code = generateGroupCode();
      attempts++;
    }

    // Create group session
    const result = await db.insert(groupSessions).values({
      code,
      name,
      hostId,
      isActive: true,
      isRiding: false,
    });

    const groupId = result[0].insertId;

    // Add host as first member (auto-approved)
    await db.insert(groupMembers).values({
      groupId,
      userId: hostId,
      isHost: true,
      isRiding: false,
      status: "approved",
    });

    return { groupId, code };
  } catch (error) {
    console.error("[Database] Failed to create group session:", error);
    return null;
  }
}

// Join a group by code
export async function joinGroupByCode(userId: number, code: string): Promise<{ groupId: number; groupName: string; status?: string } | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Find group by code
    const group = await db
      .select()
      .from(groupSessions)
      .where(and(eq(groupSessions.code, code.toUpperCase()), eq(groupSessions.isActive, true)))
      .limit(1);

    if (group.length === 0) return null;

    const groupId = group[0].id;

    // Check if already a member
    const existingMember = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (existingMember.length > 0) {
      return { groupId, groupName: group[0].name };
    }

    // Add as member with pending status (waiting for host approval)
    await db.insert(groupMembers).values({
      groupId,
      userId,
      isHost: false,
      isRiding: false,
      status: "pending",
    });

    return { groupId, groupName: group[0].name, status: "pending" };
  } catch (error) {
    console.error("[Database] Failed to join group:", error);
    return null;
  }
}

// Leave a group
export async function leaveGroup(userId: number, groupId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Check if user is host
    const group = await db
      .select()
      .from(groupSessions)
      .where(eq(groupSessions.id, groupId))
      .limit(1);

    if (group.length === 0) return false;

    if (group[0].hostId === userId) {
      // Host leaving - delete entire group
      await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
      await db.delete(groupSessions).where(eq(groupSessions.id, groupId));
    } else {
      // Regular member leaving
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    }

    return true;
  } catch (error) {
    console.error("[Database] Failed to leave group:", error);
    return false;
  }
}

// Get user's groups
export async function getUserGroups(userId: number): Promise<{
  id: number;
  code: string;
  name: string;
  hostId: number;
  hostName: string | null;
  isActive: boolean;
  isRiding: boolean;
  members: {
    userId: number;
    name: string | null;
    profileImageUrl: string | null;
    isHost: boolean;
    isRiding: boolean;
    status: "pending" | "approved" | "rejected" | null;
    distance: number;
    duration: number;
    currentSpeed: number;
    latitude: number | null;
    longitude: number | null;
  }[];
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Get groups where user is an approved member (or host)
    const memberOf = await db
      .select({ groupId: groupMembers.groupId, status: groupMembers.status })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));

    // Filter to only approved members or pending (to show pending status to the user)
    const validMemberships = memberOf.filter(m => m.status === 'approved' || m.status === 'pending');

    if (validMemberships.length === 0) return [];

    const groupIds = validMemberships.map(m => m.groupId);

    // Get group details
    const groups = await db
      .select({
        id: groupSessions.id,
        code: groupSessions.code,
        name: groupSessions.name,
        hostId: groupSessions.hostId,
        isActive: groupSessions.isActive,
        isRiding: groupSessions.isRiding,
        hostName: users.name,
      })
      .from(groupSessions)
      .leftJoin(users, eq(groupSessions.hostId, users.id))
      .where(and(
        sql`${groupSessions.id} IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})`,
        eq(groupSessions.isActive, true)
      ));

    // Filter out groups that no longer exist (isActive=false)
    if (groups.length === 0) return [];

    // Get members for each group (only approved members visible to non-hosts)
    const result = await Promise.all(
      groups.map(async (group) => {
        const members = await db
          .select({
            userId: groupMembers.userId,
            isHost: groupMembers.isHost,
            isRiding: groupMembers.isRiding,
            status: groupMembers.status,
            distance: groupMembers.distance,
            duration: groupMembers.duration,
            currentSpeed: groupMembers.currentSpeed,
            latitude: groupMembers.latitude,
            longitude: groupMembers.longitude,
            name: users.name,
            profileImageUrl: users.profileImageUrl,
          })
          .from(groupMembers)
          .leftJoin(users, eq(groupMembers.userId, users.id))
          .where(eq(groupMembers.groupId, group.id));

        return {
          ...group,
          members: members.map(m => ({
            ...m,
            latitude: m.latitude ? parseFloat(m.latitude) : null,
            longitude: m.longitude ? parseFloat(m.longitude) : null,
          })),
        };
      })
    );

    return result;
  } catch (error) {
    console.error("[Database] Failed to get user groups:", error);
    return [];
  }
}

// Get group by ID
export async function getGroupById(groupId: number): Promise<{
  id: number;
  code: string;
  name: string;
  hostId: number;
  hostName: string | null;
  isActive: boolean;
  isRiding: boolean;
  members: {
    userId: number;
    name: string | null;
    profileImageUrl: string | null;
    isHost: boolean;
    isRiding: boolean;
    status: "pending" | "approved" | "rejected" | null;
    distance: number;
    duration: number;
    currentSpeed: number;
    latitude: number | null;
    longitude: number | null;
  }[];
} | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const group = await db
      .select({
        id: groupSessions.id,
        code: groupSessions.code,
        name: groupSessions.name,
        hostId: groupSessions.hostId,
        isActive: groupSessions.isActive,
        isRiding: groupSessions.isRiding,
        hostName: users.name,
      })
      .from(groupSessions)
      .leftJoin(users, eq(groupSessions.hostId, users.id))
      .where(eq(groupSessions.id, groupId))
      .limit(1);

    if (group.length === 0) return null;

    const members = await db
      .select({
        userId: groupMembers.userId,
        isHost: groupMembers.isHost,
        isRiding: groupMembers.isRiding,
        status: groupMembers.status,
        distance: groupMembers.distance,
        duration: groupMembers.duration,
        currentSpeed: groupMembers.currentSpeed,
        latitude: groupMembers.latitude,
        longitude: groupMembers.longitude,
        name: users.name,
        profileImageUrl: users.profileImageUrl,
      })
      .from(groupMembers)
      .leftJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, groupId));

    return {
      ...group[0],
      members: members.map(m => ({
        ...m,
        latitude: m.latitude ? parseFloat(m.latitude) : null,
        longitude: m.longitude ? parseFloat(m.longitude) : null,
      })),
    };
  } catch (error) {
    console.error("[Database] Failed to get group:", error);
    return null;
  }
}

// Update member location during group riding
export async function updateGroupMemberLocation(
  groupId: number,
  userId: number,
  data: {
    latitude: number;
    longitude: number;
    distance: number;
    duration: number;
    currentSpeed: number;
    isRiding: boolean;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    console.log(`[Database] Updating group member location: groupId=${groupId}, userId=${userId}, lat=${data.latitude}, lng=${data.longitude}, isRiding=${data.isRiding}`);
    
    const result = await db
      .update(groupMembers)
      .set({
        latitude: data.latitude.toString(),
        longitude: data.longitude.toString(),
        distance: data.distance,
        duration: data.duration,
        currentSpeed: data.currentSpeed,
        isRiding: data.isRiding,
        lastLocationUpdate: new Date(),
      })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

    console.log(`[Database] Update result:`, result);
    return true;
  } catch (error) {
    console.error("[Database] Failed to update member location:", error);
    return false;
  }
}

// Start group riding
export async function startGroupRiding(groupId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Verify user is host
    const group = await db
      .select()
      .from(groupSessions)
      .where(eq(groupSessions.id, groupId))
      .limit(1);

    if (group.length === 0 || group[0].hostId !== userId) return false;

    // Update group status
    await db
      .update(groupSessions)
      .set({ isRiding: true })
      .where(eq(groupSessions.id, groupId));

    return true;
  } catch (error) {
    console.error("[Database] Failed to start group riding:", error);
    return false;
  }
}

// Stop group riding
export async function stopGroupRiding(groupId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Verify user is host
    const group = await db
      .select()
      .from(groupSessions)
      .where(eq(groupSessions.id, groupId))
      .limit(1);

    if (group.length === 0 || group[0].hostId !== userId) return false;

    // Update group status
    await db
      .update(groupSessions)
      .set({ isRiding: false })
      .where(eq(groupSessions.id, groupId));

    // Reset all members' riding status
    await db
      .update(groupMembers)
      .set({ isRiding: false })
      .where(eq(groupMembers.groupId, groupId));

    return true;
  } catch (error) {
    console.error("[Database] Failed to stop group riding:", error);
    return false;
  }
}

// Get group members' locations (for map display)
export async function getGroupMembersLocations(groupId: number): Promise<{
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number;
  duration: number;
  currentSpeed: number;
  isRiding: boolean;
  lastUpdate: Date | null;
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    console.log(`[Database] Getting group members locations for groupId=${groupId}`);
    
    const members = await db
      .select({
        userId: groupMembers.userId,
        name: users.name,
        profileImageUrl: users.profileImageUrl,
        latitude: groupMembers.latitude,
        longitude: groupMembers.longitude,
        distance: groupMembers.distance,
        duration: groupMembers.duration,
        currentSpeed: groupMembers.currentSpeed,
        isRiding: groupMembers.isRiding,
        lastUpdate: groupMembers.lastLocationUpdate,
      })
      .from(groupMembers)
      .leftJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, groupId));

    console.log(`[Database] Found ${members.length} members:`, members.map(m => ({
      userId: m.userId,
      name: m.name,
      lat: m.latitude,
      lng: m.longitude,
      isRiding: m.isRiding,
    })));

    return members.map(m => ({
      ...m,
      latitude: m.latitude ? parseFloat(m.latitude) : null,
      longitude: m.longitude ? parseFloat(m.longitude) : null,
    }));
  } catch (error) {
    console.error("[Database] Failed to get group members locations:", error);
    return [];
  }
}


// ============================================
// Group Chat Functions
// ============================================

// Send a message to a group
export async function sendGroupMessage(
  groupId: number,
  userId: number,
  message: string,
  messageType: "text" | "location" | "alert" = "text"
): Promise<{ id: number; createdAt: Date } | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Verify user is a member of the group
    const membership = await db
      .select()
      .from(groupMembers)
      .where(and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId)
      ))
      .limit(1);

    if (membership.length === 0) {
      console.error("[Database] User is not a member of the group");
      return null;
    }

    const result = await db.insert(groupMessages).values({
      groupId,
      userId,
      message,
      messageType,
    });

    const insertId = result[0].insertId;
    return { id: insertId, createdAt: new Date() };
  } catch (error) {
    console.error("[Database] Failed to send group message:", error);
    return null;
  }
}

// Get messages for a group
export async function getGroupMessages(
  groupId: number,
  options?: {
    limit?: number;
    afterId?: number;
    beforeId?: number;
  }
): Promise<{
  id: number;
  userId: number;
  userName: string | null;
  userProfileImage: string | null;
  message: string;
  messageType: "text" | "location" | "alert";
  createdAt: Date;
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const limit = options?.limit || 50;
    const conditions = [eq(groupMessages.groupId, groupId)];

    if (options?.afterId) {
      conditions.push(gt(groupMessages.id, options.afterId));
    }
    if (options?.beforeId) {
      conditions.push(lt(groupMessages.id, options.beforeId));
    }

    const messages = await db
      .select({
        id: groupMessages.id,
        userId: groupMessages.userId,
        userName: users.name,
        userProfileImage: users.profileImageUrl,
        message: groupMessages.message,
        messageType: groupMessages.messageType,
        createdAt: groupMessages.createdAt,
      })
      .from(groupMessages)
      .leftJoin(users, eq(groupMessages.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(groupMessages.id))
      .limit(limit);

    // Return in chronological order (oldest first)
    return messages.reverse();
  } catch (error) {
    console.error("[Database] Failed to get group messages:", error);
    return [];
  }
}

// Get new messages since a specific message ID
export async function getNewGroupMessages(
  groupId: number,
  afterId: number
): Promise<{
  id: number;
  userId: number;
  userName: string | null;
  userProfileImage: string | null;
  message: string;
  messageType: "text" | "location" | "alert";
  createdAt: Date;
}[]> {
  return getGroupMessages(groupId, { afterId, limit: 100 });
}

// Delete all messages for a group (when group is deleted)
export async function deleteGroupMessages(groupId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.delete(groupMessages).where(eq(groupMessages.groupId, groupId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete group messages:", error);
    return false;
  }
}


// ============================================
// Group Member Approval Functions
// ============================================

// Get pending members for a group (host only)
export async function getPendingMembers(groupId: number): Promise<{
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  joinedAt: Date;
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const members = await db
      .select({
        userId: groupMembers.userId,
        name: users.name,
        profileImageUrl: users.profileImageUrl,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .leftJoin(users, eq(groupMembers.userId, users.id))
      .where(and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.status, "pending")
      ));

    return members;
  } catch (error) {
    console.error("[Database] Failed to get pending members:", error);
    return [];
  }
}

// Approve a pending member (host only)
export async function approveMember(groupId: number, hostId: number, memberId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Verify host
    const group = await db
      .select()
      .from(groupSessions)
      .where(and(eq(groupSessions.id, groupId), eq(groupSessions.hostId, hostId)))
      .limit(1);

    if (group.length === 0) return false;

    // Update member status
    await db
      .update(groupMembers)
      .set({ status: "approved" })
      .where(and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, memberId),
        eq(groupMembers.status, "pending")
      ));

    return true;
  } catch (error) {
    console.error("[Database] Failed to approve member:", error);
    return false;
  }
}

// Reject a pending member (host only)
export async function rejectMember(groupId: number, hostId: number, memberId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Verify host
    const group = await db
      .select()
      .from(groupSessions)
      .where(and(eq(groupSessions.id, groupId), eq(groupSessions.hostId, hostId)))
      .limit(1);

    if (group.length === 0) return false;

    // Delete the pending member
    await db
      .delete(groupMembers)
      .where(and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, memberId),
        eq(groupMembers.status, "pending")
      ));

    return true;
  } catch (error) {
    console.error("[Database] Failed to reject member:", error);
    return false;
  }
}


// ============================================
// Announcement Functions
// ============================================

// Get active announcements
export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const now = new Date();
    const result = await db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.isActive, true),
          sql`(${announcements.startDate} IS NULL OR ${announcements.startDate} <= ${now})`,
          sql`(${announcements.endDate} IS NULL OR ${announcements.endDate} >= ${now})`
        )
      )
      .orderBy(desc(announcements.priority), desc(announcements.createdAt));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get active announcements:", error);
    return [];
  }
}

// Get announcement by ID
export async function getAnnouncementById(id: number): Promise<Announcement | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get announcement by id:", error);
    return null;
  }
}

// Get all announcements (admin)
export async function getAllAnnouncements(): Promise<Announcement[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get all announcements:", error);
    return [];
  }
}

// Create announcement (admin)
export async function createAnnouncement(data: InsertAnnouncement): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(announcements).values(data);
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Failed to create announcement:", error);
    return null;
  }
}

// Update announcement (admin)
export async function updateAnnouncement(id: number, data: Partial<InsertAnnouncement>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(announcements).set(data).where(eq(announcements.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update announcement:", error);
    return false;
  }
}

// Delete announcement (admin)
export async function deleteAnnouncement(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.delete(announcements).where(eq(announcements.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete announcement:", error);
    return false;
  }
}

// Get user's dismissed announcements
export async function getUserDismissedAnnouncements(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db
      .select({ announcementId: userAnnouncementReads.announcementId })
      .from(userAnnouncementReads)
      .where(and(
        eq(userAnnouncementReads.userId, userId),
        eq(userAnnouncementReads.dismissed, true)
      ));

    return result.map(r => r.announcementId);
  } catch (error) {
    console.error("[Database] Failed to get dismissed announcements:", error);
    return [];
  }
}

// Dismiss announcement for user
export async function dismissAnnouncement(userId: number, announcementId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.insert(userAnnouncementReads).values({
      userId,
      announcementId,
      dismissed: true,
    }).onDuplicateKeyUpdate({
      set: { dismissed: true },
    });
    return true;
  } catch (error) {
    console.error("[Database] Failed to dismiss announcement:", error);
    return false;
  }
}

// ============================================
// User Ban Functions (Admin)
// ============================================

// Check if user is banned
export async function isUserBanned(userId: number): Promise<{ banned: boolean; reason?: string; expiresAt?: Date }> {
  const db = await getDb();
  if (!db) return { banned: false };

  try {
    const now = new Date();
    const result = await db
      .select()
      .from(userBans)
      .where(and(
        eq(userBans.userId, userId),
        eq(userBans.isActive, true),
        sql`(${userBans.expiresAt} IS NULL OR ${userBans.expiresAt} > ${now})`
      ))
      .limit(1);

    if (result.length > 0) {
      return {
        banned: true,
        reason: result[0].reason ?? undefined,
        expiresAt: result[0].expiresAt ?? undefined,
      };
    }
    return { banned: false };
  } catch (error) {
    console.error("[Database] Failed to check user ban:", error);
    return { banned: false };
  }
}

// Ban user (admin) - enhanced with unbannedBy tracking
export async function banUser(data: {
  userId: number;
  bannedBy: number;
  reason: string;
  banType: "temporary" | "permanent";
  expiresAt?: Date;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.insert(userBans).values({
      userId: data.userId,
      bannedBy: data.bannedBy,
      reason: data.reason,
      banType: data.banType,
      expiresAt: data.expiresAt,
      isActive: true,
    });
    return true;
  } catch (error) {
    console.error("[Database] Failed to ban user:", error);
    return false;
  }
}

// Unban user (admin) - enhanced with unbannedBy tracking
export async function unbanUser(userId: number, unbannedBy?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(userBans)
      .set({ 
        isActive: false,
        unbannedBy: unbannedBy,
        unbannedAt: new Date(),
      })
      .where(and(eq(userBans.userId, userId), eq(userBans.isActive, true)));
    return true;
  } catch (error) {
    console.error("[Database] Failed to unban user:", error);
    return false;
  }
}

// Get all banned users (admin)
export async function getBannedUsers(): Promise<{
  id: number;
  userId: number;
  userName: string | null;
  reason: string | null;
  banType: string;
  expiresAt: Date | null;
  createdAt: Date;
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db
      .select({
        id: userBans.id,
        userId: userBans.userId,
        userName: users.name,
        reason: userBans.reason,
        banType: userBans.banType,
        expiresAt: userBans.expiresAt,
        createdAt: userBans.createdAt,
      })
      .from(userBans)
      .leftJoin(users, eq(userBans.userId, users.id))
      .where(eq(userBans.isActive, true))
      .orderBy(desc(userBans.createdAt));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get banned users:", error);
    return [];
  }
}

// ============================================
// Admin User Management Functions
// ============================================

// Get all users with details (admin)
export async function getAllUsersAdmin(page: number = 1, limit: number = 50): Promise<{
  users: {
    id: number;
    name: string | null;
    email: string | null;
    role: string;
    createdAt: Date;
    lastSignedIn: Date;
    profileImageUrl: string | null;
    totalRides: number;
    totalDistance: number;
    isBanned: boolean;
  }[];
  total: number;
}> {
  const db = await getDb();
  if (!db) return { users: [], total: 0 };

  try {
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(users);
    const total = countResult[0]?.count ?? 0;

    // Get users with ride stats
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Get ride stats and ban status for each user
    const usersWithStats = await Promise.all(
      result.map(async (user) => {
        const rideStats = await db
          .select({
            totalRides: sql<number>`count(*)`,
            totalDistance: sql<number>`COALESCE(sum(${ridingRecords.distance}), 0)`,
          })
          .from(ridingRecords)
          .where(eq(ridingRecords.userId, user.id));

        const banStatus = await isUserBanned(user.id);

        return {
          ...user,
          totalRides: rideStats[0]?.totalRides ?? 0,
          totalDistance: rideStats[0]?.totalDistance ?? 0,
          isBanned: banStatus.banned,
        };
      })
    );

    return { users: usersWithStats, total };
  } catch (error) {
    console.error("[Database] Failed to get all users:", error);
    return { users: [], total: 0 };
  }
}

// Get user details (admin)
export async function getUserDetailsAdmin(userId: number): Promise<{
  user: {
    id: number;
    name: string | null;
    email: string | null;
    role: string;
    createdAt: Date;
    lastSignedIn: Date;
    profileImageUrl: string | null;
  } | null;
  stats: {
    totalRides: number;
    totalDistance: number;
    totalDuration: number;
    avgSpeed: number;
    maxSpeed: number;
  };
  recentRides: RidingRecord[];
  banStatus: { banned: boolean; reason?: string; expiresAt?: Date };
}> {
  const db = await getDb();
  if (!db) return { user: null, stats: { totalRides: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, maxSpeed: 0 }, recentRides: [], banStatus: { banned: false } };

  try {
    // Get user
    const userResult = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return { user: null, stats: { totalRides: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, maxSpeed: 0 }, recentRides: [], banStatus: { banned: false } };
    }

    // Get ride stats
    const statsResult = await db
      .select({
        totalRides: sql<number>`count(*)`,
        totalDistance: sql<number>`COALESCE(sum(${ridingRecords.distance}), 0)`,
        totalDuration: sql<number>`COALESCE(sum(${ridingRecords.duration}), 0)`,
        avgSpeed: sql<number>`COALESCE(avg(${ridingRecords.avgSpeed}), 0)`,
        maxSpeed: sql<number>`COALESCE(max(${ridingRecords.maxSpeed}), 0)`,
      })
      .from(ridingRecords)
      .where(eq(ridingRecords.userId, userId));

    // Get recent rides
    const recentRides = await db
      .select()
      .from(ridingRecords)
      .where(eq(ridingRecords.userId, userId))
      .orderBy(desc(ridingRecords.createdAt))
      .limit(10);

    // Get ban status
    const banStatus = await isUserBanned(userId);

    return {
      user: userResult[0],
      stats: {
        totalRides: statsResult[0]?.totalRides ?? 0,
        totalDistance: statsResult[0]?.totalDistance ?? 0,
        totalDuration: statsResult[0]?.totalDuration ?? 0,
        avgSpeed: statsResult[0]?.avgSpeed ?? 0,
        maxSpeed: statsResult[0]?.maxSpeed ?? 0,
      },
      recentRides,
      banStatus,
    };
  } catch (error) {
    console.error("[Database] Failed to get user details:", error);
    return { user: null, stats: { totalRides: 0, totalDistance: 0, totalDuration: 0, avgSpeed: 0, maxSpeed: 0 }, recentRides: [], banStatus: { banned: false } };
  }
}

// Delete post (admin)
export async function deletePostAdmin(postId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Delete related data first
    await db.delete(postLikes).where(eq(postLikes.postId, postId));
    await db.delete(postViews).where(eq(postViews.postId, postId));
    await db.delete(comments).where(eq(comments.postId, postId));
    await db.delete(postImages).where(eq(postImages.postId, postId));
    
    // Delete the post
    await db.delete(posts).where(eq(posts.id, postId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete post:", error);
    return false;
  }
}


// ============================================
// Survey Responses Functions
// ============================================

// Submit survey response
export async function submitSurveyResponse(data: InsertSurveyResponse): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(surveyResponses).values(data);
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Failed to submit survey response:", error);
    return null;
  }
}

// Get all survey responses (admin)
export async function getAllSurveyResponses(page: number = 1, limit: number = 50): Promise<{
  responses: (SurveyResponse & { userName: string | null })[];
  total: number;
  avgOverall: number;
  avgUsability: number;
  avgFeature: number;
}> {
  const db = await getDb();
  if (!db) return { responses: [], total: 0, avgOverall: 0, avgUsability: 0, avgFeature: 0 };

  try {
    const offset = (page - 1) * limit;

    // Get responses with user names
    const responses = await db
      .select({
        id: surveyResponses.id,
        userId: surveyResponses.userId,
        overallRating: surveyResponses.overallRating,
        usabilityRating: surveyResponses.usabilityRating,
        featureRating: surveyResponses.featureRating,
        mostUsedFeature: surveyResponses.mostUsedFeature,
        improvementSuggestion: surveyResponses.improvementSuggestion,
        bugReport: surveyResponses.bugReport,
        wouldRecommend: surveyResponses.wouldRecommend,
        appVersion: surveyResponses.appVersion,
        deviceInfo: surveyResponses.deviceInfo,
        createdAt: surveyResponses.createdAt,
        userName: users.name,
      })
      .from(surveyResponses)
      .leftJoin(users, eq(surveyResponses.userId, users.id))
      .orderBy(desc(surveyResponses.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(surveyResponses);
    const total = countResult[0]?.count ?? 0;

    // Get averages
    const avgResult = await db
      .select({
        avgOverall: sql<number>`AVG(${surveyResponses.overallRating})`,
        avgUsability: sql<number>`AVG(${surveyResponses.usabilityRating})`,
        avgFeature: sql<number>`AVG(${surveyResponses.featureRating})`,
      })
      .from(surveyResponses);

    return {
      responses: responses as (SurveyResponse & { userName: string | null })[],
      total,
      avgOverall: avgResult[0]?.avgOverall ?? 0,
      avgUsability: avgResult[0]?.avgUsability ?? 0,
      avgFeature: avgResult[0]?.avgFeature ?? 0,
    };
  } catch (error) {
    console.error("[Database] Failed to get survey responses:", error);
    return { responses: [], total: 0, avgOverall: 0, avgUsability: 0, avgFeature: 0 };
  }
}

// Get survey statistics
export async function getSurveyStatistics(): Promise<{
  totalResponses: number;
  avgOverall: number;
  avgUsability: number;
  avgFeature: number;
  recommendRate: number;
  featureUsage: { feature: string; count: number }[];
}> {
  const db = await getDb();
  if (!db) return { totalResponses: 0, avgOverall: 0, avgUsability: 0, avgFeature: 0, recommendRate: 0, featureUsage: [] };

  try {
    // Get totals and averages
    const statsResult = await db
      .select({
        total: sql<number>`COUNT(*)`,
        avgOverall: sql<number>`AVG(${surveyResponses.overallRating})`,
        avgUsability: sql<number>`AVG(${surveyResponses.usabilityRating})`,
        avgFeature: sql<number>`AVG(${surveyResponses.featureRating})`,
        recommendCount: sql<number>`SUM(CASE WHEN ${surveyResponses.wouldRecommend} = true THEN 1 ELSE 0 END)`,
      })
      .from(surveyResponses);

    const total = statsResult[0]?.total ?? 0;
    const recommendCount = statsResult[0]?.recommendCount ?? 0;

    // Get feature usage breakdown
    const featureResult = await db
      .select({
        feature: surveyResponses.mostUsedFeature,
        count: sql<number>`COUNT(*)`,
      })
      .from(surveyResponses)
      .groupBy(surveyResponses.mostUsedFeature)
      .orderBy(desc(sql`COUNT(*)`));

    return {
      totalResponses: total,
      avgOverall: statsResult[0]?.avgOverall ?? 0,
      avgUsability: statsResult[0]?.avgUsability ?? 0,
      avgFeature: statsResult[0]?.avgFeature ?? 0,
      recommendRate: total > 0 ? (recommendCount / total) * 100 : 0,
      featureUsage: featureResult.map(r => ({ feature: r.feature, count: r.count })),
    };
  } catch (error) {
    console.error("[Database] Failed to get survey statistics:", error);
    return { totalResponses: 0, avgOverall: 0, avgUsability: 0, avgFeature: 0, recommendRate: 0, featureUsage: [] };
  }
}

// ============================================
// Bug Reports Functions
// ============================================

// Submit bug report
export async function submitBugReport(data: InsertBugReport): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(bugReports).values(data);
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Failed to submit bug report:", error);
    return null;
  }
}

// Get user's bug reports
export async function getUserBugReports(userId: number): Promise<BugReport[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.userId, userId))
      .orderBy(desc(bugReports.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get user bug reports:", error);
    return [];
  }
}

// Get all bug reports (admin)
export async function getAllBugReports(
  page: number = 1,
  limit: number = 50,
  statusFilter?: string
): Promise<{
  reports: (BugReport & { userName: string | null; userEmail: string | null })[];
  total: number;
  openCount: number;
  inProgressCount: number;
  resolvedCount: number;
}> {
  const db = await getDb();
  if (!db) return { reports: [], total: 0, openCount: 0, inProgressCount: 0, resolvedCount: 0 };

  try {
    const offset = (page - 1) * limit;

    // Build query with optional status filter
    let query = db
      .select({
        id: bugReports.id,
        userId: bugReports.userId,
        title: bugReports.title,
        description: bugReports.description,
        stepsToReproduce: bugReports.stepsToReproduce,
        expectedBehavior: bugReports.expectedBehavior,
        actualBehavior: bugReports.actualBehavior,
        screenshotUrls: bugReports.screenshotUrls,
        severity: bugReports.severity,
        status: bugReports.status,
        appVersion: bugReports.appVersion,
        deviceInfo: bugReports.deviceInfo,
        adminNotes: bugReports.adminNotes,
        resolvedBy: bugReports.resolvedBy,
        resolvedAt: bugReports.resolvedAt,
        createdAt: bugReports.createdAt,
        updatedAt: bugReports.updatedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(bugReports)
      .leftJoin(users, eq(bugReports.userId, users.id))
      .orderBy(desc(bugReports.createdAt))
      .limit(limit)
      .offset(offset);

    if (statusFilter) {
      query = query.where(eq(bugReports.status, statusFilter as any)) as any;
    }

    const reports = await query;

    // Get counts
    const countResult = await db
      .select({
        total: sql<number>`COUNT(*)`,
        openCount: sql<number>`SUM(CASE WHEN ${bugReports.status} = 'open' THEN 1 ELSE 0 END)`,
        inProgressCount: sql<number>`SUM(CASE WHEN ${bugReports.status} = 'in_progress' THEN 1 ELSE 0 END)`,
        resolvedCount: sql<number>`SUM(CASE WHEN ${bugReports.status} = 'resolved' THEN 1 ELSE 0 END)`,
      })
      .from(bugReports);

    return {
      reports: reports as (BugReport & { userName: string | null; userEmail: string | null })[],
      total: countResult[0]?.total ?? 0,
      openCount: countResult[0]?.openCount ?? 0,
      inProgressCount: countResult[0]?.inProgressCount ?? 0,
      resolvedCount: countResult[0]?.resolvedCount ?? 0,
    };
  } catch (error) {
    console.error("[Database] Failed to get bug reports:", error);
    return { reports: [], total: 0, openCount: 0, inProgressCount: 0, resolvedCount: 0 };
  }
}

// Update bug report status (admin)
export async function updateBugReportStatus(
  id: number,
  status: string,
  adminId: number,
  adminNotes?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Get bug report to find user ID
    const bugReport = await getBugReportById(id);
    if (!bugReport) return false;

    const updateData: any = {
      status,
      adminNotes,
    };

    if (status === "resolved" || status === "closed") {
      updateData.resolvedBy = adminId;
      updateData.resolvedAt = new Date();
    }

    await db.update(bugReports).set(updateData).where(eq(bugReports.id, id));

    // Send notification to user about status change
    const statusLabels: Record<string, string> = {
      open: "열림",
      in_progress: "진행 중",
      resolved: "해결됨",
      closed: "종료",
      wont_fix: "수정 안함",
    };

    await createNotification({
      userId: bugReport.userId,
      type: "bug_report_update",
      title: "버그 리포트 상태 변경",
      body: `"${bugReport.title}" 리포트가 "${statusLabels[status] || status}" 상태로 변경되었습니다.`,
      entityType: "bug_report",
      entityId: id,
      actorId: adminId,
    });

    return true;
  } catch (error) {
    console.error("[Database] Failed to update bug report status:", error);
    return false;
  }
}

// Get bug report by ID
export async function getBugReportById(id: number): Promise<BugReport | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.id, id))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get bug report:", error);
    return null;
  }
}


// Get badge by name
export async function getBadgeByName(name: string): Promise<Badge | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(badges)
      .where(eq(badges.name, name))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get badge by name:", error);
    return null;
  }
}


// Get all admin users
export async function getAdminUsers(): Promise<{ id: number; name: string | null; email: string | null }[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.role, "admin"));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get admin users:", error);
    return [];
  }
}

// Send notification to all admins
export async function notifyAdmins(notification: {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
  actorId?: number;
}): Promise<void> {
  const admins = await getAdminUsers();
  
  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      ...notification,
    });
  }
}


// ========== User Activity Logging ==========

// Log user activity
export async function logUserActivity(data: {
  userId: number;
  activityType: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(userActivityLogs).values({
      userId: data.userId,
      activityType: data.activityType,
      details: data.details,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });
  } catch (error) {
    console.error("[Database] Failed to log user activity:", error);
  }
}

// Get user activity logs
export async function getUserActivityLogs(userId: number, limit: number = 100): Promise<UserActivityLog[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(userActivityLogs)
      .where(eq(userActivityLogs.userId, userId))
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("[Database] Failed to get user activity logs:", error);
    return [];
  }
}

// Get activity count by type in time range
export async function getActivityCountByType(
  userId: number,
  activityType: string,
  hoursAgo: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  try {
    const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userActivityLogs)
      .where(
        and(
          eq(userActivityLogs.userId, userId),
          eq(userActivityLogs.activityType, activityType),
          gt(userActivityLogs.createdAt, cutoffTime)
        )
      );
    return result[0]?.count || 0;
  } catch (error) {
    console.error("[Database] Failed to get activity count:", error);
    return 0;
  }
}

// ========== Suspicious User Reports ==========

// Create suspicious user report
export async function createSuspiciousReport(data: {
  userId: number;
  reportType: string;
  severityScore: number;
  details?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(suspiciousUserReports).values({
      userId: data.userId,
      reportType: data.reportType,
      severityScore: data.severityScore,
      details: data.details,
    });
  } catch (error) {
    console.error("[Database] Failed to create suspicious report:", error);
  }
}

// Get all suspicious reports
export async function getSuspiciousReports(onlyUnreviewed: boolean = false): Promise<(SuspiciousUserReport & { userName: string | null; userEmail: string | null })[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const conditions = onlyUnreviewed
      ? eq(suspiciousUserReports.isReviewed, false)
      : undefined;

    const result = await db
      .select({
        id: suspiciousUserReports.id,
        userId: suspiciousUserReports.userId,
        reportType: suspiciousUserReports.reportType,
        severityScore: suspiciousUserReports.severityScore,
        details: suspiciousUserReports.details,
        isReviewed: suspiciousUserReports.isReviewed,
        reviewedBy: suspiciousUserReports.reviewedBy,
        reviewNotes: suspiciousUserReports.reviewNotes,
        actionTaken: suspiciousUserReports.actionTaken,
        reviewedAt: suspiciousUserReports.reviewedAt,
        createdAt: suspiciousUserReports.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(suspiciousUserReports)
      .leftJoin(users, eq(suspiciousUserReports.userId, users.id))
      .where(conditions)
      .orderBy(desc(suspiciousUserReports.severityScore), desc(suspiciousUserReports.createdAt));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get suspicious reports:", error);
    return [];
  }
}

// Review suspicious report
export async function reviewSuspiciousReport(
  reportId: number,
  adminId: number,
  action: "none" | "warning" | "temp_ban" | "perm_ban",
  notes?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(suspiciousUserReports)
      .set({
        isReviewed: true,
        reviewedBy: adminId,
        reviewNotes: notes,
        actionTaken: action,
        reviewedAt: new Date(),
      })
      .where(eq(suspiciousUserReports.id, reportId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to review suspicious report:", error);
    return false;
  }
}

// ========== Statistics for Admin Dashboard ==========

// Get daily user registrations
export async function getDailyRegistrations(days: number = 30): Promise<{ date: string; count: number }[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await db
      .select({
        date: sql<string>`DATE(createdAt)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(gt(users.createdAt, cutoffDate))
      .groupBy(sql`DATE(createdAt)`)
      .orderBy(sql`DATE(createdAt)`);

    return result.map(r => ({
      date: String(r.date),
      count: Number(r.count),
    }));
  } catch (error) {
    console.error("[Database] Failed to get daily registrations:", error);
    return [];
  }
}

// Get user riding statistics
export async function getUserRidingStats(userId: number): Promise<{
  totalRides: number;
  totalDistance: number;
  totalDuration: number;
  avgSpeed: number;
  maxSpeed: number;
  ridesPerDay: { date: string; count: number; distance: number }[];
}> {
  const db = await getDb();
  if (!db) return {
    totalRides: 0,
    totalDistance: 0,
    totalDuration: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    ridesPerDay: [],
  };

  try {
    // Get overall stats
    const overallStats = await db
      .select({
        totalRides: sql<number>`COUNT(*)`,
        totalDistance: sql<number>`COALESCE(SUM(distance), 0)`,
        totalDuration: sql<number>`COALESCE(SUM(duration), 0)`,
        avgSpeed: sql<number>`COALESCE(AVG(avgSpeed), 0)`,
        maxSpeed: sql<number>`COALESCE(MAX(maxSpeed), 0)`,
      })
      .from(ridingRecords)
      .where(eq(ridingRecords.userId, userId));

    // Get rides per day (last 30 days)
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailyStats = await db
      .select({
        date: sql<string>`DATE(createdAt)`,
        count: sql<number>`COUNT(*)`,
        distance: sql<number>`COALESCE(SUM(distance), 0)`,
      })
      .from(ridingRecords)
      .where(and(eq(ridingRecords.userId, userId), gt(ridingRecords.createdAt, cutoffDate)))
      .groupBy(sql`DATE(createdAt)`)
      .orderBy(sql`DATE(createdAt)`);

    const stats = overallStats[0] || {};
    return {
      totalRides: Number(stats.totalRides) || 0,
      totalDistance: Number(stats.totalDistance) || 0,
      totalDuration: Number(stats.totalDuration) || 0,
      avgSpeed: Number(stats.avgSpeed) || 0,
      maxSpeed: Number(stats.maxSpeed) || 0,
      ridesPerDay: dailyStats.map(r => ({
        date: String(r.date),
        count: Number(r.count),
        distance: Number(r.distance),
      })),
    };
  } catch (error) {
    console.error("[Database] Failed to get user riding stats:", error);
    return {
      totalRides: 0,
      totalDistance: 0,
      totalDuration: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      ridesPerDay: [],
    };
  }
}

// Get suspicious activity indicators for a user
export async function getSuspiciousIndicators(userId: number): Promise<{
  abnormalRiding: boolean;
  spamPosts: boolean;
  excessiveApiCalls: boolean;
  details: string[];
}> {
  const db = await getDb();
  if (!db) return { abnormalRiding: false, spamPosts: false, excessiveApiCalls: false, details: [] };

  const details: string[] = [];
  let abnormalRiding = false;
  let spamPosts = false;
  let excessiveApiCalls = false;

  try {
    // Check for abnormal riding patterns (very long rides > 12 hours)
    const longRides = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ridingRecords)
      .where(and(eq(ridingRecords.userId, userId), gt(ridingRecords.duration, 43200))); // 12 hours in seconds

    if ((longRides[0]?.count || 0) > 0) {
      abnormalRiding = true;
      details.push(`비정상적으로 긴 주행 기록 ${longRides[0]?.count}건 (12시간 이상)`);
    }

    // Check for very short rides with high distance (possible GPS spoofing)
    const suspiciousRides = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ridingRecords)
      .where(
        and(
          eq(ridingRecords.userId, userId),
          lt(ridingRecords.duration, 60), // Less than 1 minute
          gt(ridingRecords.distance, 1000) // More than 1km
        )
      );

    if ((suspiciousRides[0]?.count || 0) > 0) {
      abnormalRiding = true;
      details.push(`의심스러운 주행 기록 ${suspiciousRides[0]?.count}건 (1분 미만에 1km 이상)`);
    }

    // Check for spam posts (more than 10 posts in last hour)
    const recentPosts = await getActivityCountByType(userId, "post_create", 1);
    if (recentPosts > 10) {
      spamPosts = true;
      details.push(`최근 1시간 내 게시글 ${recentPosts}개 작성`);
    }

    // Check for excessive API calls (more than 1000 in last hour)
    const recentApiCalls = await getActivityCountByType(userId, "api_call", 1);
    if (recentApiCalls > 1000) {
      excessiveApiCalls = true;
      details.push(`최근 1시간 내 API 호출 ${recentApiCalls}회`);
    }

    return { abnormalRiding, spamPosts, excessiveApiCalls, details };
  } catch (error) {
    console.error("[Database] Failed to get suspicious indicators:", error);
    return { abnormalRiding: false, spamPosts: false, excessiveApiCalls: false, details: [] };
  }
}

// Get all users with suspicious activity
export async function getUsersWithSuspiciousActivity(): Promise<{
  userId: number;
  name: string | null;
  email: string | null;
  indicators: {
    abnormalRiding: boolean;
    spamPosts: boolean;
    excessiveApiCalls: boolean;
    details: string[];
  };
  severityScore: number;
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Get all users
    const allUsers = await db.select().from(users);
    const suspiciousUsers: {
      userId: number;
      name: string | null;
      email: string | null;
      indicators: {
        abnormalRiding: boolean;
        spamPosts: boolean;
        excessiveApiCalls: boolean;
        details: string[];
      };
      severityScore: number;
    }[] = [];

    for (const user of allUsers) {
      const indicators = await getSuspiciousIndicators(user.id);
      
      // Calculate severity score
      let severityScore = 0;
      if (indicators.abnormalRiding) severityScore += 30;
      if (indicators.spamPosts) severityScore += 40;
      if (indicators.excessiveApiCalls) severityScore += 30;

      if (severityScore > 0) {
        suspiciousUsers.push({
          userId: user.id,
          name: user.name,
          email: user.email,
          indicators,
          severityScore,
        });
      }
    }

    // Sort by severity score
    return suspiciousUsers.sort((a, b) => b.severityScore - a.severityScore);
  } catch (error) {
    console.error("[Database] Failed to get users with suspicious activity:", error);
    return [];
  }
}


// ============================================
// AI Chat and Battery Analysis Functions
// ============================================

// Get AI chat usage for a specific date
export async function getAiChatUsage(userId: number, date: string): Promise<AiChatUsage | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(aiChatUsage)
      .where(and(eq(aiChatUsage.userId, userId), eq(aiChatUsage.usageDate, date)))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get AI chat usage:", error);
    return null;
  }
}

// Increment AI chat usage count
export async function incrementAiChatUsage(userId: number, date: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const existing = await getAiChatUsage(userId, date);
    
    if (existing) {
      await db
        .update(aiChatUsage)
        .set({
          messageCount: sql`${aiChatUsage.messageCount} + 1`,
          lastMessageAt: new Date(),
        })
        .where(eq(aiChatUsage.id, existing.id));
    } else {
      await db.insert(aiChatUsage).values({
        userId,
        usageDate: date,
        messageCount: 1,
        lastMessageAt: new Date(),
      });
    }
  } catch (error) {
    console.error("[Database] Failed to increment AI chat usage:", error);
  }
}

// Get AI chat history
export async function getAiChatHistory(
  userId: number,
  scooterId?: number,
  limit: number = 20
): Promise<AiChatHistoryRecord[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const conditions = [eq(aiChatHistory.userId, userId)];
    if (scooterId !== undefined) {
      conditions.push(eq(aiChatHistory.scooterId, scooterId));
    }

    const result = await db
      .select()
      .from(aiChatHistory)
      .where(and(...conditions))
      .orderBy(desc(aiChatHistory.createdAt))
      .limit(limit);
    
    return result;
  } catch (error) {
    console.error("[Database] Failed to get AI chat history:", error);
    return [];
  }
}

// Save AI chat message
export async function saveAiChatMessage(
  userId: number,
  role: "user" | "assistant",
  content: string,
  scooterId?: number
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(aiChatHistory).values({
      userId,
      role,
      content,
      scooterId: scooterId || null,
    });
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Failed to save AI chat message:", error);
    return null;
  }
}

// Clear AI chat history
export async function clearAiChatHistory(userId: number, scooterId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const conditions = [eq(aiChatHistory.userId, userId)];
    if (scooterId !== undefined) {
      conditions.push(eq(aiChatHistory.scooterId, scooterId));
    }

    await db.delete(aiChatHistory).where(and(...conditions));
  } catch (error) {
    console.error("[Database] Failed to clear AI chat history:", error);
  }
}

// Get battery analysis for a scooter
export async function getBatteryAnalysis(
  userId: number,
  scooterId: number
): Promise<BatteryAnalysisRecord | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(batteryAnalysis)
      .where(and(eq(batteryAnalysis.userId, userId), eq(batteryAnalysis.scooterId, scooterId)))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get battery analysis:", error);
    return null;
  }
}

// Update battery analysis after a ride
export async function updateBatteryAnalysis(
  userId: number,
  scooterId: number,
  data: {
    distanceMeters: number;
    energyWh: number;
    efficiencyWhKm: number;
    totalDistanceMeters: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const existing = await getBatteryAnalysis(userId, scooterId);
    const efficiencyInt = Math.round(data.efficiencyWhKm * 100); // Store as integer * 100

    if (existing) {
      // Calculate new averages
      const newTotalRides = existing.totalRidesWithVoltage + 1;
      const newTotalDistance = existing.totalDistanceWithVoltage + data.distanceMeters;
      const newTotalEnergy = existing.totalEnergyConsumed + Math.round(data.energyWh * 10);
      const newAvgEfficiency = Math.round((newTotalEnergy / 10) / (newTotalDistance / 1000) * 100);
      
      // Estimate battery cycles based on total distance and efficiency
      const scooterData = await getScooterById(scooterId, userId);
      const nominalVoltage = scooterData?.batteryVoltage || 60;
      const capacity = parseFloat(scooterData?.batteryCapacity || "30");
      const totalCapacityWh = nominalVoltage * capacity;
      const totalEnergyUsedWh = newTotalEnergy / 10;
      const estimatedCycles = Math.round(totalEnergyUsedWh / (totalCapacityWh * 0.5)); // Assuming 50% average discharge

      // Estimate battery health (simple linear model)
      const maxCycles = 500; // Typical li-ion lifecycle
      const healthReduction = Math.min(estimatedCycles / maxCycles, 1) * 20;
      const batteryHealth = Math.max(0, 100 - healthReduction);

      await db
        .update(batteryAnalysis)
        .set({
          totalRidesWithVoltage: newTotalRides,
          totalDistanceWithVoltage: newTotalDistance,
          totalEnergyConsumed: newTotalEnergy,
          avgEfficiency: newAvgEfficiency,
          bestEfficiency: existing.bestEfficiency 
            ? Math.min(existing.bestEfficiency, efficiencyInt) 
            : efficiencyInt,
          worstEfficiency: existing.worstEfficiency 
            ? Math.max(existing.worstEfficiency, efficiencyInt) 
            : efficiencyInt,
          estimatedCycles,
          batteryHealth: Math.round(batteryHealth),
          lastAnalyzedAt: new Date(),
        })
        .where(eq(batteryAnalysis.id, existing.id));
    } else {
      // Create new analysis record
      await db.insert(batteryAnalysis).values({
        userId,
        scooterId,
        totalRidesWithVoltage: 1,
        totalDistanceWithVoltage: data.distanceMeters,
        totalEnergyConsumed: Math.round(data.energyWh * 10),
        avgEfficiency: efficiencyInt,
        bestEfficiency: efficiencyInt,
        worstEfficiency: efficiencyInt,
        estimatedCycles: 0,
        batteryHealth: 100,
        lastAnalyzedAt: new Date(),
      });
    }
  } catch (error) {
    console.error("[Database] Failed to update battery analysis:", error);
  }
}

// Get recent rides with voltage data for a specific scooter
export async function getRecentRidesWithVoltage(
  userId: number,
  scooterId: number,
  limit: number = 10
): Promise<{
  id: number;
  date: string;
  distance: number;
  duration: number;
  avgSpeed: number;
  voltageStart: number;
  voltageEnd: number;
  socStart: number;
  socEnd: number;
  energyWh: number | null;
}[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db
      .select({
        id: ridingRecords.id,
        date: ridingRecords.date,
        distance: ridingRecords.distance,
        duration: ridingRecords.duration,
        avgSpeed: ridingRecords.avgSpeed,
        voltageStart: ridingRecords.voltageStart,
        voltageEnd: ridingRecords.voltageEnd,
        socStart: ridingRecords.socStart,
        socEnd: ridingRecords.socEnd,
        energyWh: ridingRecords.energyWh,
      })
      .from(ridingRecords)
      .where(and(
        eq(ridingRecords.userId, userId),
        eq(ridingRecords.scooterId, scooterId),
        isNotNull(ridingRecords.voltageStart),
        isNotNull(ridingRecords.voltageEnd)
      ))
      .orderBy(desc(ridingRecords.createdAt))
      .limit(limit);

    return result.map(r => ({
      id: r.id,
      date: r.date || "",
      distance: r.distance || 0,
      duration: r.duration || 0,
      avgSpeed: Number(r.avgSpeed) || 0,
      voltageStart: Number(r.voltageStart) || 0,
      voltageEnd: Number(r.voltageEnd) || 0,
      socStart: Number(r.socStart) || 0,
      socEnd: Number(r.socEnd) || 0,
      energyWh: r.energyWh ? Number(r.energyWh) : null,
    }));
  } catch (error) {
    console.error("[Database] Failed to get recent rides with voltage:", error);
    return [];
  }
}


// ============================================
// Charging Records Functions
// ============================================

/**
 * Create a new charging record
 */
export async function createChargingRecord(data: {
  userId: number;
  scooterId: number;
  chargeDate: string;
  voltageBefore: string;
  voltageAfter: string;
  socBefore?: string;
  socAfter?: string;
  chargingDuration?: number;
  chargeType?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  try {
    const result = await db.insert(chargingRecords).values({
      userId: data.userId,
      scooterId: data.scooterId,
      chargeDate: data.chargeDate,
      voltageBefore: data.voltageBefore,
      voltageAfter: data.voltageAfter,
      socBefore: data.socBefore,
      socAfter: data.socAfter,
      chargingDuration: data.chargingDuration,
      chargeType: data.chargeType,
      notes: data.notes,
    });
    console.log("[Database] Created charging record for scooter:", data.scooterId);
    return { id: result[0].insertId, ...data };
  } catch (error) {
    console.error("[Database] Failed to create charging record:", error);
    throw error;
  }
}

/**
 * Get charging history for a scooter
 */
export async function getChargingHistory(userId: number, scooterId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) {
    return [];
  }
  try {
    const result = await db
      .select()
      .from(chargingRecords)
      .where(
        and(
          eq(chargingRecords.userId, userId),
          eq(chargingRecords.scooterId, scooterId)
        )
      )
      .orderBy(desc(chargingRecords.createdAt))
      .limit(limit);
    
    return result.map(r => ({
      id: r.id,
      chargeDate: r.chargeDate,
      voltageBefore: Number(r.voltageBefore),
      voltageAfter: Number(r.voltageAfter),
      socBefore: r.socBefore ? Number(r.socBefore) : null,
      socAfter: r.socAfter ? Number(r.socAfter) : null,
      chargingDuration: r.chargingDuration,
      chargeType: r.chargeType,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error("[Database] Failed to get charging history:", error);
    return [];
  }
}

/**
 * Get charging statistics for a scooter
 */
export async function getChargingStats(userId: number, scooterId: number) {
  const db = await getDb();
  if (!db) {
    return {
      totalCharges: 0,
      fullCharges: 0,
      partialCharges: 0,
      avgChargingDuration: null,
      lastChargeDate: null,
      avgSocGain: null,
    };
  }
  try {
    const records = await db
      .select()
      .from(chargingRecords)
      .where(
        and(
          eq(chargingRecords.userId, userId),
          eq(chargingRecords.scooterId, scooterId)
        )
      )
      .orderBy(desc(chargingRecords.createdAt));
    
    if (records.length === 0) {
      return {
        totalCharges: 0,
        fullCharges: 0,
        partialCharges: 0,
        avgChargingDuration: null,
        lastChargeDate: null,
        avgSocGain: null,
      };
    }

    type RecordType = typeof records[0];
    const fullCharges = records.filter((r: RecordType) => r.chargeType === "full").length;
    const partialCharges = records.filter((r: RecordType) => r.chargeType === "partial").length;
    
    const durationsWithValue = records.filter((r: RecordType) => r.chargingDuration != null);
    const avgChargingDuration = durationsWithValue.length > 0
      ? Math.round(durationsWithValue.reduce((sum: number, r: RecordType) => sum + (r.chargingDuration || 0), 0) / durationsWithValue.length)
      : null;

    const socGains: number[] = records
      .filter((r: typeof records[0]) => r.socBefore && r.socAfter)
      .map((r: typeof records[0]) => Number(r.socAfter) - Number(r.socBefore));
    const avgSocGain = socGains.length > 0
      ? Math.round(socGains.reduce((sum: number, g: number) => sum + g, 0) / socGains.length)
      : null;

    return {
      totalCharges: records.length,
      fullCharges,
      partialCharges,
      avgChargingDuration,
      lastChargeDate: records[0].chargeDate,
      avgSocGain,
    };
  } catch (error) {
    console.error("[Database] Failed to get charging stats:", error);
    return {
      totalCharges: 0,
      fullCharges: 0,
      partialCharges: 0,
      avgChargingDuration: null,
      lastChargeDate: null,
      avgSocGain: null,
    };
  }
}


/**
 * Delete user account and all associated data
 */
export async function deleteUserAccount(userId: number, reason?: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    console.log(`[Database] Deleting user account: ${userId}, reason: ${reason || "not provided"}`);

    // Delete in order to respect foreign key constraints
    // 1. Delete charging records
    await db.delete(chargingRecords).where(eq(chargingRecords.userId, userId));
    
    // 2. Delete battery analysis records
    await db.delete(batteryAnalysis).where(eq(batteryAnalysis.userId, userId));
    
    // 3. Delete AI chat history
    await db.delete(aiChatHistory).where(eq(aiChatHistory.userId, userId));
    
    // 4. Delete AI chat usage
    await db.delete(aiChatUsage).where(eq(aiChatUsage.userId, userId));
    
    // 5. Delete scooters
    await db.delete(scooters).where(eq(scooters.userId, userId));
    
    // 6. Delete riding records
    await db.delete(ridingRecords).where(eq(ridingRecords.userId, userId));
    
    // 7. Delete notifications
    await db.delete(notifications).where(eq(notifications.userId, userId));
    
    // 8. Delete user badges
    await db.delete(userBadges).where(eq(userBadges.userId, userId));
    
    // 9. Delete challenge participations
    await db.delete(challengeParticipants).where(eq(challengeParticipants.userId, userId));
    
    // 10. Delete challenge invitations (sent and received)
    await db.delete(challengeInvitations).where(
      or(
        eq(challengeInvitations.inviterId, userId),
        eq(challengeInvitations.inviteeId, userId)
      )
    );
    
    // 11. Delete live locations
    await db.delete(liveLocations).where(eq(liveLocations.userId, userId));
    
    // 12. Delete group memberships
    await db.delete(groupMembers).where(eq(groupMembers.userId, userId));
    
    // 13. Delete group messages
    await db.delete(groupMessages).where(eq(groupMessages.userId, userId));
    
    // 14. Delete friend requests (sent and received)
    await db.delete(friendRequests).where(
      or(
        eq(friendRequests.senderId, userId),
        eq(friendRequests.receiverId, userId)
      )
    );
    
    // 15. Delete friendships
    await db.delete(friends).where(
      or(
        eq(friends.userId1, userId),
        eq(friends.userId2, userId)
      )
    );
    
    // 16. Delete follows (following and followers)
    await db.delete(follows).where(
      or(
        eq(follows.followerId, userId),
        eq(follows.followingId, userId)
      )
    );
    
    // 17. Delete post likes
    await db.delete(postLikes).where(eq(postLikes.userId, userId));
    
    // 18. Delete post views
    await db.delete(postViews).where(eq(postViews.userId, userId));
    
    // 19. Delete comments
    await db.delete(comments).where(eq(comments.userId, userId));
    
    // 20. Delete post images (for user's posts)
    const userPosts = await db.select({ id: posts.id }).from(posts).where(eq(posts.userId, userId));
    for (const post of userPosts) {
      await db.delete(postImages).where(eq(postImages.postId, post.id));
    }
    
    // 21. Delete posts
    await db.delete(posts).where(eq(posts.userId, userId));
    
    // 22. Delete announcement reads
    await db.delete(userAnnouncementReads).where(eq(userAnnouncementReads.userId, userId));
    
    // 23. Delete survey responses
    await db.delete(surveyResponses).where(eq(surveyResponses.userId, userId));
    
    // 24. Delete bug reports
    await db.delete(bugReports).where(eq(bugReports.userId, userId));
    
    // 25. Delete activity logs
    await db.delete(userActivityLogs).where(eq(userActivityLogs.userId, userId));
    
    // 26. Delete suspicious user reports (about user)
    await db.delete(suspiciousUserReports).where(
      eq(suspiciousUserReports.userId, userId)
    );
    
    // 27. Delete user bans
    await db.delete(userBans).where(eq(userBans.userId, userId));
    
    // 28. Finally, delete the user
    await db.delete(users).where(eq(users.id, userId));

    console.log(`[Database] Successfully deleted user account: ${userId}`);
  } catch (error) {
    console.error("[Database] Failed to delete user account:", error);
    throw error;
  }
}


// ==================== Maintenance Management Functions ====================

/**
 * Get maintenance items for a scooter
 */
export async function getMaintenanceItems(userId: number, scooterId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const items = await database
    .select()
    .from(maintenanceItems)
    .where(
      and(
        eq(maintenanceItems.userId, userId),
        eq(maintenanceItems.scooterId, scooterId)
      )
    )
    .orderBy(maintenanceItems.createdAt);
  
  return { items };
}

/**
 * Add a new maintenance item
 */
export async function addMaintenanceItem(
  userId: number,
  input: {
    scooterId: number;
    name: string;
    intervalKm: number;
    notes?: string;
  }
) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const [result] = await database.insert(maintenanceItems).values({
    userId,
    scooterId: input.scooterId,
    name: input.name,
    intervalKm: input.intervalKm,
    notes: input.notes || null,
  });
  
  return { success: true, id: result.insertId };
}

/**
 * Record maintenance completion
 */
export async function recordMaintenance(
  userId: number,
  input: {
    maintenanceItemId: number;
    scooterId: number;
    distanceKm: number;
    cost?: number;
    location?: string;
    notes?: string;
  }
) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  // Insert maintenance record
  await database.insert(maintenanceRecords).values({
    maintenanceItemId: input.maintenanceItemId,
    scooterId: input.scooterId,
    userId,
    distanceKm: String(input.distanceKm),
    cost: input.cost ? String(input.cost) : null,
    location: input.location || null,
    notes: input.notes || null,
  });
  
  // Update maintenance item with last maintenance info
  await database
    .update(maintenanceItems)
    .set({
      lastMaintenanceKm: String(input.distanceKm),
      lastMaintenanceDate: new Date(),
    })
    .where(eq(maintenanceItems.id, input.maintenanceItemId));
  
  return { success: true };
}

/**
 * Delete maintenance item
 */
export async function deleteMaintenanceItem(userId: number, itemId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  // First delete related records
  await database.delete(maintenanceRecords).where(eq(maintenanceRecords.maintenanceItemId, itemId));
  
  // Then delete the item
  await database
    .delete(maintenanceItems)
    .where(
      and(
        eq(maintenanceItems.id, itemId),
        eq(maintenanceItems.userId, userId)
      )
    );
  
  return { success: true };
}

/**
 * Get maintenance history
 */
export async function getMaintenanceHistory(userId: number, scooterId: number, limit: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const records = await database
    .select({
      id: maintenanceRecords.id,
      itemName: maintenanceItems.name,
      distanceKm: maintenanceRecords.distanceKm,
      cost: maintenanceRecords.cost,
      location: maintenanceRecords.location,
      notes: maintenanceRecords.notes,
      maintenanceDate: maintenanceRecords.maintenanceDate,
    })
    .from(maintenanceRecords)
    .innerJoin(maintenanceItems, eq(maintenanceRecords.maintenanceItemId, maintenanceItems.id))
    .where(
      and(
        eq(maintenanceRecords.userId, userId),
        eq(maintenanceRecords.scooterId, scooterId)
      )
    )
    .orderBy(desc(maintenanceRecords.maintenanceDate))
    .limit(limit);
  
  return { records };
}

// ==================== Battery Health Report Functions ====================

/**
 * Generate battery health report using AI analysis
 */
export async function generateBatteryHealthReport(userId: number, scooterId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  // Get scooter info
  const [scooter] = await database
    .select()
    .from(scooters)
    .where(and(eq(scooters.id, scooterId), eq(scooters.userId, userId)));
  
  if (!scooter) {
    throw new Error("Scooter not found");
  }
  
  // Get riding records with battery data
  const rides = await database
    .select()
    .from(ridingRecords)
    .where(
      and(
        eq(ridingRecords.userId, userId),
        eq(ridingRecords.scooterId, scooterId),
        isNotNull(ridingRecords.voltageStart),
        isNotNull(ridingRecords.voltageEnd)
      )
    )
    .orderBy(desc(ridingRecords.createdAt))
    .limit(50);
  
  // Get charging records
  const charges = await database
    .select()
    .from(chargingRecords)
    .where(
      and(
        eq(chargingRecords.userId, userId),
        eq(chargingRecords.scooterId, scooterId)
      )
    )
    .orderBy(desc(chargingRecords.createdAt))
    .limit(30);
  
  // Calculate metrics
  const totalDistance = Number(scooter.totalDistance || 0) / 1000; // Convert to km
  const batteryCapacity = Number(scooter.batteryCapacity || 30);
  const batteryVoltage = Number(scooter.batteryVoltage || 60);
  const totalEnergyCapacity = batteryVoltage * batteryCapacity; // Wh
  
  // Estimate cycles based on total distance and average range
  const avgRangePerCycle = 50; // Assume 50km per full cycle
  const estimatedCycles = Math.floor(totalDistance / avgRangePerCycle);
  
  // Calculate average efficiency from rides
  let totalEfficiency = 0;
  let efficiencyCount = 0;
  
  for (const ride of rides) {
    if (ride.energyWh && Number(ride.distance) > 0) {
      const efficiency = Number(ride.energyWh) / (Number(ride.distance) / 1000);
      totalEfficiency += efficiency;
      efficiencyCount++;
    }
  }
  
  const avgEfficiency = efficiencyCount > 0 ? totalEfficiency / efficiencyCount : 30; // Default 30 Wh/km
  
  // Estimate battery health based on cycles and efficiency degradation
  // Typical Li-ion battery: 80% capacity after 500-1000 cycles
  const maxCycles = 800; // Conservative estimate
  const cycleBasedHealth = Math.max(0, 100 - (estimatedCycles / maxCycles) * 20);
  
  // Efficiency-based health (compare to expected)
  const expectedEfficiency = 25; // Expected Wh/km for a healthy battery
  const efficiencyRatio = expectedEfficiency / avgEfficiency;
  const efficiencyBasedHealth = Math.min(100, efficiencyRatio * 100);
  
  // Combined health estimate
  const healthPercent = Math.round((cycleBasedHealth * 0.6 + efficiencyBasedHealth * 0.4));
  
  // Estimate remaining cycles
  const remainingCycles = Math.max(0, maxCycles - estimatedCycles);
  
  // Capacity degradation estimate
  const capacityDegradation = Math.max(0, 100 - healthPercent);
  
  // Generate AI analysis
  let aiAnalysis = "";
  let recommendations = "";
  
  if (healthPercent >= 80) {
    aiAnalysis = `배터리 상태가 양호합니다. 현재 추정 건강도는 ${healthPercent}%이며, 약 ${estimatedCycles}회의 충전 사이클을 사용했습니다. 평균 효율은 ${avgEfficiency.toFixed(1)} Wh/km로 정상 범위입니다.`;
    recommendations = "현재 사용 패턴을 유지하세요. 완전 방전을 피하고 20-80% 범위에서 충전하면 배터리 수명을 더 연장할 수 있습니다.";
  } else if (healthPercent >= 60) {
    aiAnalysis = `배터리가 중간 수준의 노화를 보이고 있습니다. 건강도 ${healthPercent}%, 약 ${estimatedCycles}회 사이클 사용. 효율이 ${avgEfficiency.toFixed(1)} Wh/km로 다소 높아졌습니다.`;
    recommendations = "배터리 교체를 6개월~1년 내로 계획하세요. 장거리 주행 전 충전 상태를 확인하고, 급속 충전보다 완속 충전을 권장합니다.";
  } else {
    aiAnalysis = `배터리 교체가 필요한 시점입니다. 건강도 ${healthPercent}%, 약 ${estimatedCycles}회 사이클 사용. 효율이 ${avgEfficiency.toFixed(1)} Wh/km로 상당히 저하되었습니다.`;
    recommendations = "가능한 빨리 배터리 교체를 권장합니다. 현재 배터리로는 주행 거리가 크게 감소했을 수 있습니다. 장거리 주행을 피하고 충전기를 항상 휴대하세요.";
  }
  
  // Save report to database
  const [result] = await database.insert(batteryHealthReports).values({
    scooterId,
    userId,
    healthPercent: String(healthPercent),
    estimatedCyclesRemaining: remainingCycles,
    totalCycles: estimatedCycles,
    totalDistanceKm: String(totalDistance),
    avgEfficiency: String(avgEfficiency.toFixed(2)),
    capacityDegradation: String(capacityDegradation),
    aiAnalysis,
    recommendations,
  });
  
  return {
    id: result.insertId,
    healthPercent,
    estimatedCyclesRemaining: remainingCycles,
    totalCycles: estimatedCycles,
    totalDistanceKm: totalDistance,
    avgEfficiency,
    capacityDegradation,
    aiAnalysis,
    recommendations,
  };
}

/**
 * Get latest battery health report
 */
export async function getLatestBatteryHealthReport(userId: number, scooterId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const [report] = await database
    .select()
    .from(batteryHealthReports)
    .where(
      and(
        eq(batteryHealthReports.userId, userId),
        eq(batteryHealthReports.scooterId, scooterId)
      )
    )
    .orderBy(desc(batteryHealthReports.reportDate))
    .limit(1);
  
  if (!report) {
    return null;
  }
  
  return {
    ...report,
    healthPercent: Number(report.healthPercent),
    totalDistanceKm: Number(report.totalDistanceKm),
    avgEfficiency: Number(report.avgEfficiency),
    capacityDegradation: Number(report.capacityDegradation),
  };
}

/**
 * Get battery health history
 */
export async function getBatteryHealthHistory(userId: number, scooterId: number, limit: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const reports = await database
    .select()
    .from(batteryHealthReports)
    .where(
      and(
        eq(batteryHealthReports.userId, userId),
        eq(batteryHealthReports.scooterId, scooterId)
      )
    )
    .orderBy(desc(batteryHealthReports.reportDate))
    .limit(limit);
  
  return {
    reports: reports.map((r: BatteryHealthReport) => ({
      ...r,
      healthPercent: Number(r.healthPercent),
      totalDistanceKm: Number(r.totalDistanceKm),
      avgEfficiency: Number(r.avgEfficiency),
      capacityDegradation: Number(r.capacityDegradation),
    })),
  };
}

// ==================== Admin Riding Records Functions ====================

export interface RidingRecordWithUser {
  id: number;
  recordId: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  date: string;
  distance: number;
  duration: number;
  avgSpeed: number;
  maxSpeed: number;
  scooterId: number | null;
  scooterName: string | null;
  createdAt: Date;
}

/**
 * Get all riding records for admin (with user info)
 */
export async function getAllRidingRecordsAdmin(
  page: number = 1,
  limit: number = 50
): Promise<{ records: RidingRecordWithUser[]; total: number }> {
  const db = await getDb();
  if (!db) return { records: [], total: 0 };

  try {
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(ridingRecords);
    const total = countResult[0]?.count ?? 0;

    // Get records with user info
    const result = await db
      .select({
        id: ridingRecords.id,
        recordId: ridingRecords.recordId,
        userId: ridingRecords.userId,
        userName: users.name,
        userEmail: users.email,
        date: ridingRecords.date,
        distance: ridingRecords.distance,
        duration: ridingRecords.duration,
        avgSpeed: ridingRecords.avgSpeed,
        maxSpeed: ridingRecords.maxSpeed,
        scooterId: ridingRecords.scooterId,
        createdAt: ridingRecords.createdAt,
      })
      .from(ridingRecords)
      .leftJoin(users, eq(ridingRecords.userId, users.id))
      .orderBy(desc(ridingRecords.createdAt))
      .limit(limit)
      .offset(offset);

    // Get scooter names for records that have scooterId
    const recordsWithScooter = await Promise.all(
      result.map(async (record) => {
        let scooterName: string | null = null;
        if (record.scooterId) {
          const scooterResult = await db
            .select({ name: scooters.name })
            .from(scooters)
            .where(eq(scooters.id, record.scooterId))
            .limit(1);
          scooterName = scooterResult[0]?.name ?? null;
        }
        return {
          ...record,
          date: record.date || "",
          distance: record.distance || 0,
          duration: record.duration || 0,
          avgSpeed: record.avgSpeed || 0,
          maxSpeed: record.maxSpeed || 0,
          scooterName,
          createdAt: record.createdAt || new Date(),
        };
      })
    );

    return { records: recordsWithScooter, total };
  } catch (error) {
    console.error("[Database] Failed to get all riding records:", error);
    return { records: [], total: 0 };
  }
}


// ==================== Eco Leaderboard Functions ====================

export interface EcoLeaderboardEntry {
  rank: number;
  userId: number;
  userName: string;
  profileImageUrl?: string;
  avgEcoScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  totalCO2Saved: number;
  rideCount: number;
}

// Calculate eco score from ride data
function calculateEcoScoreFromRide(
  avgSpeed: number,
  maxSpeed: number,
  distance: number,
  duration: number
): { score: number; co2Saved: number } {
  // Optimal speed score (15-25km/h is optimal)
  let speedScore = 100;
  if (avgSpeed < 15) {
    speedScore = Math.max(0, (avgSpeed / 15) * 100);
  } else if (avgSpeed > 25) {
    speedScore = Math.max(0, 100 - ((avgSpeed - 25) * 6.67));
  }
  
  // Max speed penalty (over 40km/h reduces score)
  const maxSpeedPenalty = maxSpeed > 40 ? Math.min(30, (maxSpeed - 40) * 1.5) : 0;
  
  // Distance bonus (longer rides are more efficient)
  const distanceKm = distance / 1000;
  const distanceBonus = Math.min(20, distanceKm * 4);
  
  // Calculate final score
  const score = Math.max(0, Math.min(100, speedScore - maxSpeedPenalty + distanceBonus));
  
  // CO2 saved (car emits ~120g/km, scooter ~5g/km)
  const co2Saved = distanceKm * 0.115; // kg
  
  return { score: Math.round(score), co2Saved };
}

// Determine grade from score
function getGradeFromScore(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// Get eco leaderboard
export async function getEcoLeaderboard(
  period: "weekly" | "monthly" | "allTime",
  limit: number = 50
): Promise<EcoLeaderboardEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  let startDate: Date | null = null;

  if (period === "weekly") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now);
    startDate.setDate(diff);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  // allTime: startDate remains null

  try {
    // Build query conditions
    const conditions = [sql`${ridingRecords.userId} IS NOT NULL`];
    if (startDate) {
      conditions.push(sql`${ridingRecords.createdAt} >= ${startDate}`);
    }

    // Get all riding records in the period
    const records = await db
      .select({
        userId: ridingRecords.userId,
        distance: ridingRecords.distance,
        duration: ridingRecords.duration,
        avgSpeed: ridingRecords.avgSpeed,
        maxSpeed: ridingRecords.maxSpeed,
      })
      .from(ridingRecords)
      .where(and(...conditions));

    // Aggregate by user
    const userStats = new Map<number, { 
      totalScore: number; 
      totalCO2Saved: number; 
      rideCount: number;
    }>();
    
    for (const record of records) {
      if (!record.userId) continue;
      
      const { score, co2Saved } = calculateEcoScoreFromRide(
        record.avgSpeed || 0,
        record.maxSpeed || 0,
        record.distance || 0,
        record.duration || 0
      );
      
      const existing = userStats.get(record.userId) || { 
        totalScore: 0, 
        totalCO2Saved: 0, 
        rideCount: 0 
      };
      
      userStats.set(record.userId, {
        totalScore: existing.totalScore + score,
        totalCO2Saved: existing.totalCO2Saved + co2Saved,
        rideCount: existing.rideCount + 1,
      });
    }

    // Get user info
    const userIds = Array.from(userStats.keys());
    if (userIds.length === 0) return [];

    const userInfos = await db
      .select({
        id: users.id,
        name: users.name,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);

    // Build leaderboard
    const leaderboard: EcoLeaderboardEntry[] = userInfos
      .map((user) => {
        const stats = userStats.get(user.id) || { totalScore: 0, totalCO2Saved: 0, rideCount: 0 };
        const avgScore = stats.rideCount > 0 ? Math.round(stats.totalScore / stats.rideCount) : 0;
        
        return {
          rank: 0,
          userId: user.id,
          userName: user.name || "Unknown",
          profileImageUrl: user.profileImageUrl || undefined,
          avgEcoScore: avgScore,
          grade: getGradeFromScore(avgScore),
          totalCO2Saved: Math.round(stats.totalCO2Saved * 100) / 100,
          rideCount: stats.rideCount,
        };
      })
      .sort((a, b) => b.avgEcoScore - a.avgEcoScore)
      .slice(0, limit)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return leaderboard;
  } catch (error) {
    console.error("[Database] Failed to get eco leaderboard:", error);
    return [];
  }
}

// Get user's eco rank
export async function getUserEcoRank(
  userId: number,
  period: "weekly" | "monthly" | "allTime"
): Promise<EcoLeaderboardEntry | null> {
  const leaderboard = await getEcoLeaderboard(period, 1000); // Get more to find user
  const userEntry = leaderboard.find(entry => entry.userId === userId);
  return userEntry || null;
}


// ==================== Push Notification Functions ====================

/**
 * Save user's Expo Push Token
 */
export async function saveExpoPushToken(userId: number, token: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users)
      .set({ expoPushToken: token })
      .where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to save push token:", error);
    return false;
  }
}

/**
 * Get user's Expo Push Token
 */
export async function getUserPushToken(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select({ expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return result[0]?.expoPushToken || null;
  } catch (error) {
    console.error("[Database] Failed to get push token:", error);
    return null;
  }
}

/**
 * Send push notification to a user via Expo Push API
 */
export async function sendPushNotification(
  userId: number,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  const token = await getUserPushToken(userId);
  if (!token) {
    console.log(`[Push] No push token for user ${userId}`);
    return false;
  }

  try {
    const message = {
      to: token,
      sound: "default",
      title,
      body,
      data: data || {},
    };

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    
    if (result.data?.status === "ok") {
      console.log(`[Push] Notification sent to user ${userId}`);
      return true;
    } else {
      console.error(`[Push] Failed to send notification:`, result);
      return false;
    }
  } catch (error) {
    console.error("[Push] Error sending notification:", error);
    return false;
  }
}

/**
 * Send push notification to multiple users
 */
export async function sendPushNotificationToUsers(
  userIds: number[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const userId of userIds) {
    const sent = await sendPushNotification(userId, title, body, data);
    if (sent) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}
