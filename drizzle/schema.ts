import { boolean, int, mysqlEnum, mysqlTable, text, mediumtext, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

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
  /** GPS points as JSON string (MEDIUMTEXT for large rides up to 16MB) */
  gpsPointsJson: mediumtext("gpsPointsJson"),
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
  /** Post type: general, ride_share, question, tip, group_recruit */
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
  /** Optional message with the request */
  message: text("message"),
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


/**
 * App versions table for update management
 */
export const appVersions = mysqlTable("appVersions", {
  id: int("id").autoincrement().primaryKey(),
  /** Version string (e.g., "1.0.0") */
  version: varchar("version", { length: 20 }).notNull(),
  /** Version code (integer, e.g., 1, 2, 3) */
  versionCode: int("versionCode").notNull(),
  /** APK download URL */
  downloadUrl: varchar("downloadUrl", { length: 500 }).notNull(),
  /** Release notes */
  releaseNotes: text("releaseNotes"),
  /** Whether this update is mandatory */
  forceUpdate: boolean("forceUpdate").default(false).notNull(),
  /** Platform (android, ios) */
  platform: varchar("platform", { length: 20 }).default("android").notNull(),
  /** Whether this version is active/latest */
  isActive: boolean("isActive").default(true).notNull(),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AppVersion = typeof appVersions.$inferSelect;
export type InsertAppVersion = typeof appVersions.$inferInsert;


/**
 * Group riding sessions table
 */
export const groupSessions = mysqlTable("groupSessions", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique group code (6 characters) */
  code: varchar("code", { length: 6 }).notNull().unique(),
  /** Group name */
  name: varchar("name", { length: 100 }).notNull(),
  /** Host user ID */
  hostId: int("hostId").notNull(),
  /** Whether the group is currently active */
  isActive: boolean("isActive").default(true).notNull(),
  /** Whether riding is in progress */
  isRiding: boolean("isRiding").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GroupSession = typeof groupSessions.$inferSelect;
export type InsertGroupSession = typeof groupSessions.$inferInsert;

/**
 * Group members table
 */
export const groupMembers = mysqlTable("groupMembers", {
  id: int("id").autoincrement().primaryKey(),
  /** Group session ID */
  groupId: int("groupId").notNull(),
  /** User ID */
  userId: int("userId").notNull(),
  /** Whether this member is the host */
  isHost: boolean("isHost").default(false).notNull(),
  /** Member status: pending (waiting approval), approved, rejected */
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  /** Whether this member is currently riding */
  isRiding: boolean("isRiding").default(false).notNull(),
  /** Current distance in meters */
  distance: int("distance").default(0).notNull(),
  /** Current duration in seconds */
  duration: int("duration").default(0).notNull(),
  /** Current speed in km/h * 10 */
  currentSpeed: int("currentSpeed").default(0).notNull(),
  /** Current latitude */
  latitude: varchar("latitude", { length: 20 }),
  /** Current longitude */
  longitude: varchar("longitude", { length: 20 }),
  /** Last location update time */
  lastLocationUpdate: timestamp("lastLocationUpdate"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = typeof groupMembers.$inferInsert;


/**
 * Group chat messages table
 */
export const groupMessages = mysqlTable("groupMessages", {
  id: int("id").autoincrement().primaryKey(),
  /** Group session ID */
  groupId: int("groupId").notNull(),
  /** Sender user ID */
  userId: int("userId").notNull(),
  /** Message content */
  message: text("message").notNull(),
  /** Message type: text, location, alert */
  messageType: mysqlEnum("messageType", ["text", "location", "alert"]).default("text").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GroupMessage = typeof groupMessages.$inferSelect;
export type InsertGroupMessage = typeof groupMessages.$inferInsert;


/**
 * Announcements/Notices table for app-wide announcements
 */
export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  /** Announcement title */
  title: varchar("title", { length: 200 }).notNull(),
  /** Announcement content (supports markdown) */
  content: text("content").notNull(),
  /** Announcement type: notice, update, event, maintenance */
  type: mysqlEnum("type", ["notice", "update", "event", "maintenance"]).default("notice").notNull(),
  /** Whether this announcement is active/visible */
  isActive: boolean("isActive").default(true).notNull(),
  /** Whether to show as popup on home screen */
  showPopup: boolean("showPopup").default(true).notNull(),
  /** Priority for ordering (higher = more important) */
  priority: int("priority").default(0).notNull(),
  /** Start date for displaying (null = immediately) */
  startDate: timestamp("startDate"),
  /** End date for displaying (null = forever) */
  endDate: timestamp("endDate"),
  /** Admin user ID who created this */
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

/**
 * User announcement read status (for "don't show again" feature)
 */
export const userAnnouncementReads = mysqlTable("userAnnouncementReads", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID */
  userId: int("userId").notNull(),
  /** Announcement ID */
  announcementId: int("announcementId").notNull(),
  /** Whether user dismissed this announcement (don't show again) */
  dismissed: boolean("dismissed").default(false).notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
});

export type UserAnnouncementRead = typeof userAnnouncementReads.$inferSelect;
export type InsertUserAnnouncementRead = typeof userAnnouncementReads.$inferInsert;

/**
 * User bans table for admin moderation
 */
export const userBans = mysqlTable("userBans", {
  id: int("id").autoincrement().primaryKey(),
  /** Banned user ID */
  userId: int("userId").notNull(),
  /** Admin who issued the ban */
  bannedBy: int("bannedBy").notNull(),
  /** Ban reason */
  reason: text("reason"),
  /** Ban type: temporary, permanent */
  banType: mysqlEnum("banType", ["temporary", "permanent"]).default("temporary").notNull(),
  /** Ban end date (null for permanent bans) */
  expiresAt: timestamp("expiresAt"),
  /** Whether the ban is currently active */
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserBan = typeof userBans.$inferSelect;
export type InsertUserBan = typeof userBans.$inferInsert;


/**
 * Alpha test survey responses
 */
export const surveyResponses = mysqlTable("surveyResponses", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID who submitted the survey */
  userId: int("userId").notNull(),
  /** Overall satisfaction rating (1-5) */
  overallRating: int("overallRating").notNull(),
  /** Usability rating (1-5) */
  usabilityRating: int("usabilityRating").notNull(),
  /** Feature completeness rating (1-5) */
  featureRating: int("featureRating").notNull(),
  /** Most used feature (riding, group, community, scooter, stats) */
  mostUsedFeature: varchar("mostUsedFeature", { length: 50 }).notNull(),
  /** Improvement suggestions */
  improvementSuggestion: text("improvementSuggestion"),
  /** Bug reports */
  bugReport: text("bugReport"),
  /** Would recommend to friends */
  wouldRecommend: boolean("wouldRecommend"),
  /** App version at submission time */
  appVersion: varchar("appVersion", { length: 20 }),
  /** Device info */
  deviceInfo: varchar("deviceInfo", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type InsertSurveyResponse = typeof surveyResponses.$inferInsert;

/**
 * Bug reports with screenshots
 */
export const bugReports = mysqlTable("bugReports", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID who submitted the report */
  userId: int("userId").notNull(),
  /** Bug title/summary */
  title: varchar("title", { length: 200 }).notNull(),
  /** Bug description */
  description: text("description").notNull(),
  /** Steps to reproduce */
  stepsToReproduce: text("stepsToReproduce"),
  /** Expected behavior */
  expectedBehavior: text("expectedBehavior"),
  /** Actual behavior */
  actualBehavior: text("actualBehavior"),
  /** Screenshot URLs (JSON array) */
  screenshotUrls: text("screenshotUrls"),
  /** Bug severity: low, medium, high, critical */
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  /** Bug status: open, in_progress, resolved, closed, wont_fix */
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed", "wont_fix"]).default("open").notNull(),
  /** App version at submission time */
  appVersion: varchar("appVersion", { length: 20 }),
  /** Device info (OS, model, etc.) */
  deviceInfo: varchar("deviceInfo", { length: 200 }),
  /** Admin notes */
  adminNotes: text("adminNotes"),
  /** Resolved by admin ID */
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BugReport = typeof bugReports.$inferSelect;
export type InsertBugReport = typeof bugReports.$inferInsert;
