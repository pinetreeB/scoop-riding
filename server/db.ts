import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, ridingRecords, InsertRidingRecord, RidingRecord } from "../drizzle/schema";
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

    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
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
