import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  /** Hashed password for email/password auth */
  passwordHash: varchar("passwordHash", { length: 255 }),
  /** Google OAuth ID for Google login */
  googleId: varchar("googleId", { length: 128 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Email verification status */
  emailVerified: boolean("emailVerified").default(false).notNull(),
  /** Password reset token (temporary) */
  passwordResetToken: varchar("passwordResetToken", { length: 512 }),
  /** Password reset token expiry */
  passwordResetExpiry: timestamp("passwordResetExpiry"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** Profile image URL (S3 or external) */
  profileImageUrl: varchar("profileImageUrl", { length: 500 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Riding records table for storing user ride history
 */
export const ridingRecords = mysqlTable("ridingRecords", {
  id: int("id").autoincrement().primaryKey(),
  /** User who made this ride */
  userId: int("userId").notNull(),
  /** Unique record ID (UUID) */
  recordId: varchar("recordId", { length: 64 }).notNull().unique(),
  /** Ride date string */
  date: varchar("date", { length: 32 }).notNull(),
  /** Duration in seconds */
  duration: int("duration").notNull(),
  /** Distance in meters */
  distance: int("distance").notNull(),
  /** Average speed in km/h */
  avgSpeed: int("avgSpeed").notNull(),
  /** Max speed in km/h */
  maxSpeed: int("maxSpeed").notNull(),
  /** Start time */
  startTime: timestamp("startTime"),
  /** End time */
  endTime: timestamp("endTime"),
  /** GPS points as JSON string */
  gpsPointsJson: text("gpsPointsJson"),
  /** Scooter used for this ride (optional) */
  scooterId: int("scooterId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RidingRecord = typeof ridingRecords.$inferSelect;
export type InsertRidingRecord = typeof ridingRecords.$inferInsert;

/**
 * Scooter (기체) management table
 */
export const scooters = mysqlTable("scooters", {
  id: int("id").autoincrement().primaryKey(),
  /** User who owns this scooter */
  userId: int("userId").notNull(),
  /** Scooter name (user-defined) */
  name: varchar("name", { length: 100 }).notNull(),
  /** Manufacturer/Brand */
  brand: varchar("brand", { length: 100 }),
  /** Model name */
  model: varchar("model", { length: 100 }),
  /** Serial number */
  serialNumber: varchar("serialNumber", { length: 100 }),
  /** Purchase date */
  purchaseDate: timestamp("purchaseDate"),
  /** Initial odometer reading in meters */
  initialOdometer: int("initialOdometer").default(0).notNull(),
  /** Total distance ridden with this scooter (accumulated from rides) in meters */
  totalDistance: int("totalDistance").default(0).notNull(),
  /** Total ride count */
  totalRides: int("totalRides").default(0).notNull(),
  /** Whether this is the default/active scooter */
  isDefault: boolean("isDefault").default(false).notNull(),
  /** Scooter color for UI */
  color: varchar("color", { length: 20 }).default("#FF6D00"),
  /** Notes */
  notes: text("notes"),
  /** Maintenance interval in meters (default 500km) */
  maintenanceInterval: int("maintenanceInterval").default(500000).notNull(),
  /** Distance at last maintenance in meters */
  lastMaintenanceDistance: int("lastMaintenanceDistance").default(0).notNull(),
  /** Last maintenance date */
  lastMaintenanceDate: timestamp("lastMaintenanceDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Scooter = typeof scooters.$inferSelect;
export type InsertScooter = typeof scooters.$inferInsert;

/**
 * Community posts table
 */
export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  /** Author user ID */
  userId: int("userId").notNull(),
  /** Post title */
  title: varchar("title", { length: 200 }).notNull(),
  /** Post content */
  content: text("content").notNull(),
  /** Post type: general, ride_share, question, tip */
  postType: varchar("postType", { length: 32 }).default("general").notNull(),
  /** Attached riding record ID (optional) */
  ridingRecordId: varchar("ridingRecordId", { length: 64 }),
  /** Like count */
  likeCount: int("likeCount").default(0).notNull(),
  /** Comment count */
  commentCount: int("commentCount").default(0).notNull(),
  /** View count */
  viewCount: int("viewCount").default(0).notNull(),
  /** Image URLs (JSON array) */
  imageUrls: text("imageUrls"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

/**
 * Post comments table
 */
export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  /** Post ID */
  postId: int("postId").notNull(),
  /** Author user ID */
  userId: int("userId").notNull(),
  /** Comment content */
  content: text("content").notNull(),
  /** Parent comment ID for replies (null for top-level comments) */
  parentId: int("parentId"),
  /** Like count */
  likeCount: int("likeCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

/**
 * Post likes table
 */
export const postLikes = mysqlTable("postLikes", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PostLike = typeof postLikes.$inferSelect;
export type InsertPostLike = typeof postLikes.$inferInsert;


/**
 * Friend requests table
 */
export const friendRequests = mysqlTable("friendRequests", {
  id: int("id").autoincrement().primaryKey(),
  /** User who sent the request */
  senderId: int("senderId").notNull(),
  /** User who received the request */
  receiverId: int("receiverId").notNull(),
  /** Status: pending, accepted, rejected */
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FriendRequest = typeof friendRequests.$inferSelect;
export type InsertFriendRequest = typeof friendRequests.$inferInsert;

/**
 * Friends table (accepted friendships)
 */
export const friends = mysqlTable("friends", {
  id: int("id").autoincrement().primaryKey(),
  /** First user ID (always smaller) */
  userId1: int("userId1").notNull(),
  /** Second user ID (always larger) */
  userId2: int("userId2").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Friend = typeof friends.$inferSelect;
export type InsertFriend = typeof friends.$inferInsert;

/**
 * Follows table (one-way follow relationship)
 */
export const follows = mysqlTable("follows", {
  id: int("id").autoincrement().primaryKey(),
  /** User who is following */
  followerId: int("followerId").notNull(),
  /** User being followed */
  followingId: int("followingId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Follow = typeof follows.$inferSelect;
export type InsertFollow = typeof follows.$inferInsert;

/**
 * Post images table
 */
export const postImages = mysqlTable("postImages", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  /** Image URL (S3 or local path) */
  imageUrl: varchar("imageUrl", { length: 500 }).notNull(),
  /** Image order in the post */
  orderIndex: int("orderIndex").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PostImage = typeof postImages.$inferSelect;
export type InsertPostImage = typeof postImages.$inferInsert;

/**
 * Post views table (track unique views per user)
 */
export const postViews = mysqlTable("postViews", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PostView = typeof postViews.$inferSelect;
export type InsertPostView = typeof postViews.$inferInsert;


/**
 * Notifications table
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  /** User who receives the notification */
  userId: int("userId").notNull(),
  /** Type of notification */
  type: varchar("type", { length: 50 }).notNull(), // friend_request, friend_accepted, like, comment, follow
  /** Title of the notification */
  title: varchar("title", { length: 200 }).notNull(),
  /** Body/message of the notification */
  body: varchar("body", { length: 500 }),
  /** Related entity type (post, user, etc.) */
  entityType: varchar("entityType", { length: 50 }),
  /** Related entity ID */
  entityId: int("entityId"),
  /** User who triggered the notification */
  actorId: int("actorId"),
  /** Whether the notification has been read */
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Challenges table
 */
export const challenges = mysqlTable("challenges", {
  id: int("id").autoincrement().primaryKey(),
  /** Challenge creator */
  creatorId: int("creatorId").notNull(),
  /** Challenge title */
  title: varchar("title", { length: 200 }).notNull(),
  /** Challenge description */
  description: text("description"),
  /** Challenge type: distance, rides, duration */
  type: varchar("type", { length: 50 }).notNull(),
  /** Target value (km, count, minutes) */
  targetValue: decimal("targetValue", { precision: 10, scale: 2 }).notNull(),
  /** Start date */
  startDate: timestamp("startDate").notNull(),
  /** End date */
  endDate: timestamp("endDate").notNull(),
  /** Is public challenge */
  isPublic: boolean("isPublic").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = typeof challenges.$inferInsert;

/**
 * Challenge participants table
 */
export const challengeParticipants = mysqlTable("challengeParticipants", {
  id: int("id").autoincrement().primaryKey(),
  challengeId: int("challengeId").notNull(),
  userId: int("userId").notNull(),
  /** Current progress value */
  progress: decimal("progress", { precision: 10, scale: 2 }).default("0").notNull(),
  /** Completion status */
  isCompleted: boolean("isCompleted").default(false).notNull(),
  completedAt: timestamp("completedAt"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;
export type InsertChallengeParticipant = typeof challengeParticipants.$inferInsert;


/**
 * Live location table for real-time friend tracking during rides
 */
export const liveLocations = mysqlTable("liveLocations", {
  id: int("id").autoincrement().primaryKey(),
  /** User who is sharing location */
  userId: int("userId").notNull().unique(),
  /** Current latitude */
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  /** Current longitude */
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  /** Current heading/bearing in degrees */
  heading: decimal("heading", { precision: 5, scale: 2 }),
  /** Current speed in m/s */
  speed: decimal("speed", { precision: 6, scale: 2 }),
  /** Whether user is currently riding */
  isRiding: boolean("isRiding").default(false).notNull(),
  /** Last update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LiveLocation = typeof liveLocations.$inferSelect;
export type InsertLiveLocation = typeof liveLocations.$inferInsert;

/**
 * Badges/Achievements table
 */
export const badges = mysqlTable("badges", {
  id: int("id").autoincrement().primaryKey(),
  /** Badge name */
  name: varchar("name", { length: 100 }).notNull(),
  /** Badge description */
  description: text("description"),
  /** Badge icon name */
  icon: varchar("icon", { length: 50 }).notNull(),
  /** Badge color */
  color: varchar("color", { length: 20 }).notNull(),
  /** Badge category: distance, rides, social, challenge */
  category: varchar("category", { length: 50 }).notNull(),
  /** Requirement value to earn this badge */
  requirement: decimal("requirement", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = typeof badges.$inferInsert;

/**
 * User badges (earned achievements)
 */
export const userBadges = mysqlTable("userBadges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  badgeId: int("badgeId").notNull(),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
});

export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = typeof userBadges.$inferInsert;

/**
 * Challenge invitations table
 */
export const challengeInvitations = mysqlTable("challengeInvitations", {
  id: int("id").autoincrement().primaryKey(),
  challengeId: int("challengeId").notNull(),
  /** User who sent the invitation */
  inviterId: int("inviterId").notNull(),
  /** User who received the invitation */
  inviteeId: int("inviteeId").notNull(),
  /** Invitation status: pending, accepted, declined */
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
});

export type ChallengeInvitation = typeof challengeInvitations.$inferSelect;
export type InsertChallengeInvitation = typeof challengeInvitations.$inferInsert;
