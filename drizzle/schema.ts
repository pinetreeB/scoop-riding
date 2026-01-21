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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Scooter = typeof scooters.$inferSelect;
export type InsertScooter = typeof scooters.$inferInsert;
