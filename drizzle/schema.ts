import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Email verification status */
  emailVerified: boolean("emailVerified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RidingRecord = typeof ridingRecords.$inferSelect;
export type InsertRidingRecord = typeof ridingRecords.$inferInsert;
