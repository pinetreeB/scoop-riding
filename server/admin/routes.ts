import { Router, Request, Response, NextFunction } from "express";
import * as jose from "jose";
import * as path from "path";
import * as fs from "fs";
import { ENV } from "../_core/env";
import * as db from "../db";
import { eq, desc, asc, like, or, sql, and, gte } from "drizzle-orm";
import { users, ridingRecords, announcements, posts, surveyResponses, bugReports, adminLogs, scooters, friends } from "../../drizzle/schema";

const router = Router();

// Admin JWT secret (separate from user auth)
const ADMIN_JWT_SECRET = new TextEncoder().encode(
  ENV.cookieSecret + "-admin" || "scoop-admin-secret-key"
);

// Admin credentials (in production, store these securely)
const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || "admin@scoop.app",
  password: process.env.ADMIN_PASSWORD || "scoop2024!admin"
};

// Sub-admin credentials (limited permissions - cannot view activity logs)
const SUB_ADMIN_CREDENTIALS = {
  email: "subadmin@scoop.app",
  password: "scoop2024!sub"
};

// Admin roles: "admin" = full access, "sub-admin" = limited (no activity logs)
type AdminRole = "admin" | "sub-admin";

// Middleware to verify admin token
async function verifyAdminToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "인증이 필요합니다." });
  }

  const token = authHeader.substring(7);
  try {
    const { payload } = await jose.jwtVerify(token, ADMIN_JWT_SECRET);
    if (payload.role !== "admin" && payload.role !== "sub-admin") {
      return res.status(403).json({ error: "관리자 권한이 필요합니다." });
    }
    (req as any).adminEmail = payload.email;
    (req as any).adminRole = payload.role as AdminRole;
    next();
  } catch (e) {
    return res.status(401).json({ error: "유효하지 않은 토큰입니다." });
  }
}

// Middleware to verify full admin (not sub-admin) for sensitive operations
async function verifyFullAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req as any).adminRole !== "admin") {
    return res.status(403).json({ error: "주 관리자 권한이 필요합니다." });
  }
  next();
}

// Admin login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Check against admin credentials or database admin users
  const dbInstance = await db.getDb();
  
  // First check hardcoded admin
  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    const token = await new jose.SignJWT({ email, role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(ADMIN_JWT_SECRET);
    
    return res.json({ token, email, role: "admin" });
  }

  // Check hardcoded sub-admin
  if (email === SUB_ADMIN_CREDENTIALS.email && password === SUB_ADMIN_CREDENTIALS.password) {
    const token = await new jose.SignJWT({ email, role: "sub-admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(ADMIN_JWT_SECRET);
    
    return res.json({ token, email, role: "sub-admin" });
  }

  // Check database admin users
  if (dbInstance) {
    const dbUser = await dbInstance
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.role, "admin")))
      .limit(1);

    if (dbUser.length > 0) {
      // For DB admins, verify password (simplified - in production use proper hash comparison)
      const user = dbUser[0];
      if (user.passwordHash) {
        const [salt, hash] = user.passwordHash.split(":");
        if (salt && hash) {
          const crypto = await import("crypto");
          const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
          if (hash === verifyHash) {
            const token = await new jose.SignJWT({ email: user.email, role: "admin", userId: user.id })
              .setProtectedHeader({ alg: "HS256" })
              .setIssuedAt()
              .setExpirationTime("24h")
              .sign(ADMIN_JWT_SECRET);
            
            return res.json({ token, email: user.email });
          }
        }
      }
    }
  }

  return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
});

// Get current admin info
router.get("/me", verifyAdminToken, (req: Request, res: Response) => {
  res.json({ email: (req as any).adminEmail, role: (req as any).adminRole });
});

// Get dashboard stats
router.get("/stats", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.json({ totalUsers: 0, todayUsers: 0, totalRides: 0, totalDistance: 0 });
    }

    // Total users
    const totalUsersResult = await dbInstance
      .select({ count: sql`COUNT(*)` })
      .from(users);
    const totalUsers = Number(totalUsersResult[0]?.count) || 0;

    // Today's new users (KST timezone = UTC+9)
    // KST 00:00 = UTC 15:00 (previous day)
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // UTC+9 in milliseconds
    const nowKST = new Date(now.getTime() + kstOffset);
    // Get today's date in KST, then convert back to UTC for DB comparison
    const todayKSTDate = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate()));
    const todayStartUTC = new Date(todayKSTDate.getTime() - kstOffset); // KST 00:00 in UTC
    const todayUsersResult = await dbInstance
      .select({ count: sql`COUNT(*)` })
      .from(users)
      .where(gte(users.createdAt, todayStartUTC));
    const todayUsers = Number(todayUsersResult[0]?.count) || 0;

    // Total rides
    const totalRidesResult = await dbInstance
      .select({ count: sql`COUNT(*)` })
      .from(ridingRecords);
    const totalRides = Number(totalRidesResult[0]?.count) || 0;

    // Total distance
    const totalDistanceResult = await dbInstance
      .select({ total: sql`COALESCE(SUM(distance), 0)` })
      .from(ridingRecords);
    // Convert meters to km (distance is stored in meters)
    const totalDistanceMeters = Number(totalDistanceResult[0]?.total) || 0;
    const totalDistance = Math.round(totalDistanceMeters / 1000 * 10) / 10; // Round to 1 decimal

    // Weekly stats (this week starting from Monday, KST timezone)
    const dayOfWeekKST = nowKST.getUTCDay();
    const daysFromMonday = dayOfWeekKST === 0 ? 6 : dayOfWeekKST - 1;
    const weekStartKSTDate = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate() - daysFromMonday));
    const weekStartUTC = new Date(weekStartKSTDate.getTime() - kstOffset); // Monday KST 00:00 in UTC

    // Weekly new users
    const weeklyUsersResult = await dbInstance
      .select({ count: sql`COUNT(*)` })
      .from(users)
      .where(gte(users.createdAt, weekStartUTC));
    const weeklyNewUsers = Number(weeklyUsersResult[0]?.count) || 0;

    // Weekly rides
    const weeklyRidesResult = await dbInstance
      .select({ count: sql`COUNT(*)`, total: sql`COALESCE(SUM(distance), 0)` })
      .from(ridingRecords)
      .where(gte(ridingRecords.createdAt, weekStartUTC));
    const weeklyRides = Number(weeklyRidesResult[0]?.count) || 0;
    const weeklyDistanceMeters = Number(weeklyRidesResult[0]?.total) || 0;
    const weeklyDistance = Math.round(weeklyDistanceMeters / 1000 * 10) / 10;

    // Weekly posts
    const weeklyPostsResult = await dbInstance
      .select({ count: sql`COUNT(*)` })
      .from(posts)
      .where(gte(posts.createdAt, weekStartUTC));
    const weeklyPosts = Number(weeklyPostsResult[0]?.count) || 0;

    res.json({ 
      totalUsers, todayUsers, totalRides, totalDistance,
      weeklyNewUsers, weeklyRides, weeklyDistance, weeklyPosts
    });
  } catch (e) {
    console.error("Admin stats error:", e);
    res.status(500).json({ error: "통계를 불러오는데 실패했습니다." });
  }
});

// Get chart data for dashboard (daily/weekly stats)
router.get("/chart-data", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.json({ dailyUsers: [], weeklyUsers: [], dailyRides: [], weeklyRides: [] });
    }

    const kstOffset = 9 * 60 * 60 * 1000; // UTC+9 in milliseconds
    const now = new Date();
    const nowKST = new Date(now.getTime() + kstOffset);

    // Daily users for last 7 days
    const dailyUsers = [];
    for (let i = 6; i >= 0; i--) {
      const dayKST = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate() - i));
      const dayStartUTC = new Date(dayKST.getTime() - kstOffset);
      const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000);
      
      const result = await dbInstance
        .select({ count: sql`COUNT(*)` })
        .from(users)
        .where(and(gte(users.createdAt, dayStartUTC), sql`${users.createdAt} < ${dayEndUTC}`));
      
      const month = dayKST.getUTCMonth() + 1;
      const date = dayKST.getUTCDate();
      dailyUsers.push({
        label: `${month}/${date}`,
        count: Number(result[0]?.count) || 0
      });
    }

    // Weekly users for last 4 weeks
    const weeklyUsers = [];
    const dayOfWeekKST = nowKST.getUTCDay();
    const daysFromMonday = dayOfWeekKST === 0 ? 6 : dayOfWeekKST - 1;
    const thisWeekMondayKST = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate() - daysFromMonday));
    
    for (let i = 3; i >= 0; i--) {
      const weekStartKST = new Date(thisWeekMondayKST.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStartUTC = new Date(weekStartKST.getTime() - kstOffset);
      const weekEndUTC = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const result = await dbInstance
        .select({ count: sql`COUNT(*)` })
        .from(users)
        .where(and(gte(users.createdAt, weekStartUTC), sql`${users.createdAt} < ${weekEndUTC}`));
      
      const weekLabel = i === 0 ? "이번주" : i === 1 ? "지난주" : `${i}주 전`;
      weeklyUsers.push({
        label: weekLabel,
        count: Number(result[0]?.count) || 0
      });
    }

    // Daily rides for last 7 days
    const dailyRides = [];
    for (let i = 6; i >= 0; i--) {
      const dayKST = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate() - i));
      const dayStartUTC = new Date(dayKST.getTime() - kstOffset);
      const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000);
      
      const result = await dbInstance
        .select({ count: sql`COUNT(*)`, distance: sql`COALESCE(SUM(distance), 0)` })
        .from(ridingRecords)
        .where(and(gte(ridingRecords.createdAt, dayStartUTC), sql`${ridingRecords.createdAt} < ${dayEndUTC}`));
      
      const month = dayKST.getUTCMonth() + 1;
      const date = dayKST.getUTCDate();
      dailyRides.push({
        label: `${month}/${date}`,
        count: Number(result[0]?.count) || 0,
        distance: Math.round(Number(result[0]?.distance || 0) / 1000 * 10) / 10 // km
      });
    }

    // Weekly rides for last 4 weeks
    const weeklyRides = [];
    for (let i = 3; i >= 0; i--) {
      const weekStartKST = new Date(thisWeekMondayKST.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStartUTC = new Date(weekStartKST.getTime() - kstOffset);
      const weekEndUTC = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const result = await dbInstance
        .select({ count: sql`COUNT(*)`, distance: sql`COALESCE(SUM(distance), 0)` })
        .from(ridingRecords)
        .where(and(gte(ridingRecords.createdAt, weekStartUTC), sql`${ridingRecords.createdAt} < ${weekEndUTC}`));
      
      const weekLabel = i === 0 ? "이번주" : i === 1 ? "지난주" : `${i}주 전`;
      weeklyRides.push({
        label: weekLabel,
        count: Number(result[0]?.count) || 0,
        distance: Math.round(Number(result[0]?.distance || 0) / 1000 * 10) / 10 // km
      });
    }

    res.json({ dailyUsers, weeklyUsers, dailyRides, weeklyRides });
  } catch (e) {
    console.error("Admin chart data error:", e);
    res.status(500).json({ error: "차트 데이터를 불러오는데 실패했습니다." });
  }
});

// Get users list with pagination and search
router.get("/users", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.json({ users: [], total: 0, totalPages: 0 });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const role = req.query.role as string;
    const sort = req.query.sort as string || "newest";
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];
    if (search) {
      conditions.push(
        or(
          like(users.name, `%${search}%`),
          like(users.email, `%${search}%`)
        )
      );
    }
    if (role) {
      conditions.push(eq(users.role, role as "user" | "admin"));
    }

    // Get total count
    const countQuery = dbInstance
      .select({ count: sql`COUNT(*)` })
      .from(users);
    
    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }
    
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count) || 0;

    // Build order by
    let orderBy;
    switch (sort) {
      case "oldest":
        orderBy = asc(users.createdAt);
        break;
      case "lastActive":
        orderBy = desc(users.lastSignedIn);
        break;
      case "name":
        orderBy = asc(users.name);
        break;
      default:
        orderBy = desc(users.createdAt);
    }

    // Get users
    const usersQuery = dbInstance
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        loginMethod: users.loginMethod,
        profileImageUrl: users.profileImageUrl,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn
      })
      .from(users)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      usersQuery.where(and(...conditions));
    }

    const usersList = await usersQuery;

    res.json({
      users: usersList,
      total,
      totalPages: Math.ceil(total / limit),
      page
    });
  } catch (e) {
    console.error("Admin users list error:", e);
    res.status(500).json({ error: "사용자 목록을 불러오는데 실패했습니다." });
  }
});

// Get single user detail
router.get("/users/:id", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const userId = parseInt(req.params.id);
    
    const userResult = await dbInstance
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const user = userResult[0];

    // Get user stats
    const statsResult = await dbInstance
      .select({
        totalRides: sql`COUNT(*)`,
        totalDistance: sql`COALESCE(SUM(distance), 0)`,
        totalDuration: sql`COALESCE(SUM(duration), 0)`
      })
      .from(ridingRecords)
      .where(eq(ridingRecords.userId, userId));

    // Convert meters to km (distance is stored in meters)
    const totalDistanceMeters = Number(statsResult[0]?.totalDistance) || 0;
    const stats = {
      totalRides: Number(statsResult[0]?.totalRides) || 0,
      totalDistance: Math.round(totalDistanceMeters / 1000 * 10) / 10, // Convert to km
      totalDuration: Number(statsResult[0]?.totalDuration) || 0
    };

    res.json({
      ...user,
      passwordHash: undefined,
      stats
    });
  } catch (e) {
    console.error("Admin user detail error:", e);
    res.status(500).json({ error: "사용자 정보를 불러오는데 실패했습니다." });
  }
});

// Get user full profile (with scooters, posts, friends)
router.get("/users/:id/profile", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const userId = parseInt(req.params.id);
    
    // Get user basic info
    const userResult = await dbInstance
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const user = userResult[0];

    // Get riding stats
    const statsResult = await dbInstance
      .select({
        totalRides: sql`COUNT(*)`,
        totalDistance: sql`COALESCE(SUM(distance), 0)`,
        totalDuration: sql`COALESCE(SUM(duration), 0)`
      })
      .from(ridingRecords)
      .where(eq(ridingRecords.userId, userId));

    const totalDistanceMeters = Number(statsResult[0]?.totalDistance) || 0;
    const ridingStats = {
      totalRides: Number(statsResult[0]?.totalRides) || 0,
      totalDistance: Math.round(totalDistanceMeters / 1000 * 10) / 10,
      totalDuration: Number(statsResult[0]?.totalDuration) || 0
    };

    // Get user's scooters
    const userScooters = await dbInstance
      .select()
      .from(scooters)
      .where(eq(scooters.userId, userId));

    // Get user's posts
    const userPosts = await dbInstance
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(10);

    // Get user's friends
    const friendsResult1 = await dbInstance
      .select({ friendId: friends.userId2 })
      .from(friends)
      .where(eq(friends.userId1, userId));
    
    const friendsResult2 = await dbInstance
      .select({ friendId: friends.userId1 })
      .from(friends)
      .where(eq(friends.userId2, userId));

    const friendIds = [
      ...friendsResult1.map(f => f.friendId),
      ...friendsResult2.map(f => f.friendId)
    ];

    let userFriends: any[] = [];
    if (friendIds.length > 0) {
      userFriends = await dbInstance
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(sql`${users.id} IN (${sql.raw(friendIds.join(','))})`);
    }

    res.json({
      user: {
        ...user,
        passwordHash: undefined,
        lastLoginAt: user.lastSignedIn
      },
      ridingStats,
      scooters: userScooters,
      posts: userPosts,
      friends: userFriends
    });
  } catch (e) {
    console.error("Admin user profile error:", e);
    res.status(500).json({ error: "사용자 정보를 불러오는데 실패했습니다." });
  }
});

// Update user
router.put("/users/:id", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.status(500).json({ error: "데이터베이스 연결 실패" });
    }

    const userId = parseInt(req.params.id);
    const { name, email, role } = req.body;

    // Get old user data for logging
    const oldUserData = await dbInstance
      .select({ name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId));

    await dbInstance
      .update(users)
      .set({
        name: name || null,
        email: email || null,
        role: role || "user",
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Log admin action
    const adminEmail = (req as any).adminEmail || "unknown";
    await dbInstance.insert(adminLogs).values({
      adminEmail,
      actionType: "user_edit",
      targetType: "user",
      targetId: userId,
      details: JSON.stringify({
        before: oldUserData[0] || {},
        after: { name, email, role }
      }),
      ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null
    });

    res.json({ success: true });
  } catch (e) {
    console.error("Admin user update error:", e);
    res.status(500).json({ error: "사용자 정보 수정에 실패했습니다." });
  }
});

// Delete user
router.delete("/users/:id", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.status(500).json({ error: "데이터베이스 연결 실패" });
    }

    const userId = parseInt(req.params.id);

    // Get user data for logging before deletion
    const userData = await dbInstance
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    // Delete user's riding records first
    await dbInstance
      .delete(ridingRecords)
      .where(eq(ridingRecords.userId, userId));

    // Delete user
    await dbInstance
      .delete(users)
      .where(eq(users.id, userId));

    // Log admin action
    const adminEmail = (req as any).adminEmail || "unknown";
    await dbInstance.insert(adminLogs).values({
      adminEmail,
      actionType: "user_delete",
      targetType: "user",
      targetId: userId,
      details: JSON.stringify({
        deletedUser: userData[0] || { id: userId }
      }),
      ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null
    });

    res.json({ success: true });
  } catch (e) {
    console.error("Admin user delete error:", e);
    res.status(500).json({ error: "사용자 삭제에 실패했습니다." });
  }
});

// ============ Announcements API ============
router.get("/announcements", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.json([]);
    
    const result = await dbInstance
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt));
    
    res.json(result);
  } catch (e) {
    console.error("Admin announcements error:", e);
    res.status(500).json({ error: "공지사항을 불러오는데 실패했습니다." });
  }
});

router.post("/announcements", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.status(500).json({ error: "DB 연결 실패" });
    
    const { title, content, type, showPopup, isActive, expiresAt } = req.body;
    
    await dbInstance.insert(announcements).values({
      title,
      content,
      type: type || "notice",
      showPopup: showPopup ?? true,
      isActive: isActive ?? true,
      endDate: expiresAt ? new Date(expiresAt) : null,
      createdBy: 1
    });
    
    res.json({ success: true });
  } catch (e) {
    console.error("Admin create announcement error:", e);
    res.status(500).json({ error: "공지사항 생성에 실패했습니다." });
  }
});

router.put("/announcements/:id", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.status(500).json({ error: "DB 연결 실패" });
    
    const id = parseInt(req.params.id);
    const { title, content, type, showPopup, isActive, expiresAt } = req.body;
    
    await dbInstance
      .update(announcements)
      .set({
        title,
        content,
        type,
        showPopup,
        isActive,
        endDate: expiresAt ? new Date(expiresAt) : null
      })
      .where(eq(announcements.id, id));
    
    res.json({ success: true });
  } catch (e) {
    console.error("Admin update announcement error:", e);
    res.status(500).json({ error: "공지사항 수정에 실패했습니다." });
  }
});

router.delete("/announcements/:id", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.status(500).json({ error: "DB 연결 실패" });
    
    const id = parseInt(req.params.id);
    await dbInstance.delete(announcements).where(eq(announcements.id, id));
    
    res.json({ success: true });
  } catch (e) {
    console.error("Admin delete announcement error:", e);
    res.status(500).json({ error: "공지사항 삭제에 실패했습니다." });
  }
});

// ============ Survey Responses API ============
router.get("/surveys", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.json({ responses: [], stats: {} });
    
    const responses = await dbInstance
      .select({
        id: surveyResponses.id,
        userId: surveyResponses.userId,
        rating: surveyResponses.overallRating,
        wouldRecommend: surveyResponses.wouldRecommend,
        mostUsedFeature: surveyResponses.mostUsedFeature,
        feedback: surveyResponses.improvementSuggestion,
        createdAt: surveyResponses.createdAt,
        userName: users.name,
        userEmail: users.email
      })
      .from(surveyResponses)
      .leftJoin(users, eq(surveyResponses.userId, users.id))
      .orderBy(desc(surveyResponses.createdAt));
    
    // Calculate stats
    const totalResponses = responses.length;
    const avgRating = totalResponses > 0 
      ? responses.reduce((sum, r) => sum + (r.rating || 0), 0) / totalResponses 
      : 0;
    const recommendCount = responses.filter(r => r.wouldRecommend).length;
    const recommendRate = totalResponses > 0 ? (recommendCount / totalResponses) * 100 : 0;
    
    // Feature usage stats
    const featureStats: Record<string, number> = {};
    responses.forEach(r => {
      if (r.mostUsedFeature) {
        featureStats[r.mostUsedFeature] = (featureStats[r.mostUsedFeature] || 0) + 1;
      }
    });
    
    res.json({
      responses,
      stats: {
        totalResponses,
        avgRating: avgRating.toFixed(1),
        recommendRate: recommendRate.toFixed(0),
        featureStats
      }
    });
  } catch (e) {
    console.error("Admin surveys error:", e);
    res.status(500).json({ error: "설문 응답을 불러오는데 실패했습니다." });
  }
});

// ============ Bug Reports API ============
router.get("/bugs", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.json([]);
    
    const reports = await dbInstance
      .select({
        id: bugReports.id,
        userId: bugReports.userId,
        title: bugReports.title,
        description: bugReports.description,
        severity: bugReports.severity,
        status: bugReports.status,
        screenshotUrls: bugReports.screenshotUrls,
        deviceInfo: bugReports.deviceInfo,
        stepsToReproduce: bugReports.stepsToReproduce,
        adminNotes: bugReports.adminNotes,
        createdAt: bugReports.createdAt,
        updatedAt: bugReports.updatedAt,
        userName: users.name,
        userEmail: users.email
      })
      .from(bugReports)
      .leftJoin(users, eq(bugReports.userId, users.id))
      .orderBy(desc(bugReports.createdAt));
    
    res.json(reports);
  } catch (e) {
    console.error("Admin bugs error:", e);
    res.status(500).json({ error: "버그 리포트를 불러오는데 실패했습니다." });
  }
});

router.put("/bugs/:id/status", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.status(500).json({ error: "DB 연결 실패" });
    
    const id = parseInt(req.params.id);
    const { status, adminNotes } = req.body;
    
    const updateData: any = { status, updatedAt: new Date() };
    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }
    
    await dbInstance
      .update(bugReports)
      .set(updateData)
      .where(eq(bugReports.id, id));
    
    // Send notification to user
    const report = await dbInstance
      .select({ userId: bugReports.userId, title: bugReports.title })
      .from(bugReports)
      .where(eq(bugReports.id, id))
      .limit(1);
    
    if (report.length > 0 && report[0].userId) {
      const statusText = status === "resolved" ? "해결됨" : status === "in_progress" ? "처리 중" : "확인됨";
      let notificationBody = `"${report[0].title}" 버그 리포트가 "${statusText}" 상태로 변경되었습니다.`;
      if (adminNotes) {
        notificationBody += `\n\n관리자 답변: ${adminNotes}`;
      }
      await db.createNotification({
        userId: report[0].userId,
        type: "bug_report_update",
        title: "버그 리포트 상태 변경",
        body: notificationBody,
        entityType: "bug_report",
        entityId: id
      });
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error("Admin update bug status error:", e);
    res.status(500).json({ error: "버그 상태 변경에 실패했습니다." });
  }
});

// Reply to bug report (add admin notes)
router.post("/bugs/:id/reply", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.status(500).json({ error: "DB 연결 실패" });
    
    const id = parseInt(req.params.id);
    const { message } = req.body;
    
    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "답변 내용을 입력해주세요." });
    }
    
    // Get current report
    const report = await dbInstance
      .select({ userId: bugReports.userId, title: bugReports.title, adminNotes: bugReports.adminNotes })
      .from(bugReports)
      .where(eq(bugReports.id, id))
      .limit(1);
    
    if (report.length === 0) {
      return res.status(404).json({ error: "버그 리포트를 찾을 수 없습니다." });
    }
    
    // Append new message to admin notes with timestamp
    const timestamp = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const newNote = `[${timestamp}] ${message}`;
    const existingNotes = report[0].adminNotes || "";
    const updatedNotes = existingNotes ? `${existingNotes}\n\n${newNote}` : newNote;
    
    await dbInstance
      .update(bugReports)
      .set({ adminNotes: updatedNotes, updatedAt: new Date() })
      .where(eq(bugReports.id, id));
    
    // Send notification to user (in-app)
    if (report[0].userId) {
      await db.createNotification({
        userId: report[0].userId,
        type: "bug_report_update",
        title: "버그 리포트 답변",
        body: `"${report[0].title}" 버그 리포트에 관리자 답변이 등록되었습니다.\n\n${message}`,
        entityType: "bug_report",
        entityId: id
      });
      
      // Send push notification
      await db.sendPushNotification(
        report[0].userId,
        "버그 리포트 답변 📩",
        `"${report[0].title}" 버그 리포트에 관리자 답변이 등록되었습니다.`,
        { type: "bug_report_reply", bugReportId: id }
      );
    }
    
    res.json({ success: true, adminNotes: updatedNotes });
  } catch (e) {
    console.error("Admin reply bug report error:", e);
    res.status(500).json({ error: "답변 등록에 실패했습니다." });
  }
});

// ============ Posts API ============
router.get("/posts", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.json([]);
    
    const postsList = await dbInstance
      .select({
        id: posts.id,
        content: posts.content,
        imageUrls: posts.imageUrls,
        likeCount: posts.likeCount,
        commentCount: posts.commentCount,
        viewCount: posts.viewCount,
        createdAt: posts.createdAt,
        authorId: posts.userId,
        authorName: users.name,
        authorEmail: users.email
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .orderBy(desc(posts.createdAt))
      .limit(100);
    
    res.json(postsList);
  } catch (e) {
    console.error("Admin posts error:", e);
    res.status(500).json({ error: "게시글을 불러오는데 실패했습니다." });
  }
});

router.delete("/posts/:id", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.status(500).json({ error: "DB 연결 실패" });
    
    const id = parseInt(req.params.id);
    await dbInstance.delete(posts).where(eq(posts.id, id));
    
    res.json({ success: true });
  } catch (e) {
    console.error("Admin delete post error:", e);
    res.status(500).json({ error: "게시글 삭제에 실패했습니다." });
  }
});

// ============ Statistics API ============
// Get daily registrations for chart
router.get("/stats/registrations", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = await db.getDailyRegistrations(days);
    res.json(data);
  } catch (e) {
    console.error("Admin registrations stats error:", e);
    res.status(500).json({ error: "일별 가입자 통계를 불러오는데 실패했습니다." });
  }
});

// Get user riding statistics
router.get("/stats/user/:userId", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const stats = await db.getUserRidingStats(userId);
    res.json(stats);
  } catch (e) {
    console.error("Admin user stats error:", e);
    res.status(500).json({ error: "사용자 주행 통계를 불러오는데 실패했습니다." });
  }
});

// Get all riding records (paginated)
router.get("/rides", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await db.getAllRidingRecordsAdmin(page, limit);
    res.json(result);
  } catch (e) {
    console.error("Admin all rides error:", e);
    res.status(500).json({ error: "주행 기록을 불러오는데 실패했습니다." });
  }
});

// Get user ride history
router.get("/rides/user/:userId", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      return res.json({ rides: [] });
    }
    
    const rides = await dbInstance
      .select()
      .from(ridingRecords)
      .where(eq(ridingRecords.userId, userId))
      .orderBy(desc(ridingRecords.createdAt))
      .limit(50);
    
    res.json({ rides });
  } catch (e) {
    console.error("Admin user rides error:", e);
    res.status(500).json({ error: "주행 기록을 불러오는데 실패했습니다." });
  }
});

// ============ AI Usage Stats API ============
// Get AI usage statistics for admin dashboard
router.get("/ai-usage", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || "monthly";
    const { getAiUsageStats } = await import("../ai-usage");
    const stats = await getAiUsageStats(period as "daily" | "weekly" | "monthly");
    res.json(stats);
  } catch (e) {
    console.error("Admin AI usage stats error:", e);
    res.status(500).json({ error: "AI 사용량 통계를 불러오는데 실패했습니다." });
  }
});

// ============ Suspicious User Monitoring API ============
// Get suspicious users list
router.get("/monitoring/suspicious", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const users = await db.getUsersWithSuspiciousActivity();
    res.json(users);
  } catch (e) {
    console.error("Admin suspicious users error:", e);
    res.status(500).json({ error: "의심 사용자 목록을 불러오는데 실패했습니다." });
  }
});

// Get suspicious reports
router.get("/monitoring/reports", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const onlyUnreviewed = req.query.unreviewed === "true";
    const reports = await db.getSuspiciousReports(onlyUnreviewed);
    res.json(reports);
  } catch (e) {
    console.error("Admin suspicious reports error:", e);
    res.status(500).json({ error: "의심 리포트를 불러오는데 실패했습니다." });
  }
});

// Review suspicious report
router.post("/monitoring/reports/:id/review", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(req.params.id);
    const { action, notes, adminId } = req.body;
    
    const success = await db.reviewSuspiciousReport(
      reportId,
      adminId || 1,
      action || "none",
      notes
    );
    
    res.json({ success });
  } catch (e) {
    console.error("Admin review report error:", e);
    res.status(500).json({ error: "리포트 검토에 실패했습니다." });
  }
});

// Get user activity logs
router.get("/monitoring/activity/:userId", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = await db.getUserActivityLogs(userId, limit);
    res.json(logs);
  } catch (e) {
    console.error("Admin activity logs error:", e);
    res.status(500).json({ error: "활동 로그를 불러오는데 실패했습니다." });
  }
});

// Get suspicious indicators for a user
router.get("/monitoring/indicators/:userId", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const indicators = await db.getSuspiciousIndicators(userId);
    res.json(indicators);
  } catch (e) {
    console.error("Admin indicators error:", e);
    res.status(500).json({ error: "의심 지표를 불러오는데 실패했습니다." });
  }
});

// ============ Ban Management API ============
// Get active bans
router.get("/bans", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const bans = await db.getBannedUsers();
    res.json(bans);
  } catch (e) {
    console.error("Admin bans error:", e);
    res.status(500).json({ error: "차단 목록을 불러오는데 실패했습니다." });
  }
});

// Ban user
router.post("/bans", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const { userId, reason, banType, expiresAt, adminId } = req.body;
    
    const success = await db.banUser({
      userId,
      bannedBy: adminId || 1,
      reason: reason || "관리자에 의한 제재",
      banType: banType || "temporary",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // Log admin action
    const dbInstance = await db.getDb();
    if (dbInstance && success) {
      const adminEmail = (req as any).adminEmail || "unknown";
      await dbInstance.insert(adminLogs).values({
        adminEmail,
        actionType: "user_ban",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({ reason, banType, expiresAt }),
        ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null
      });
    }
    
    res.json({ success });
  } catch (e) {
    console.error("Admin ban user error:", e);
    res.status(500).json({ error: "사용자 차단에 실패했습니다." });
  }
});

// Unban user
router.delete("/bans/:userId", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const success = await db.unbanUser(userId);

    // Log admin action
    const dbInstance = await db.getDb();
    if (dbInstance && success) {
      const adminEmail = (req as any).adminEmail || "unknown";
      await dbInstance.insert(adminLogs).values({
        adminEmail,
        actionType: "user_unban",
        targetType: "user",
        targetId: userId,
        details: null,
        ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null
      });
    }

    res.json({ success });
  } catch (e) {
    console.error("Admin unban user error:", e);
    res.status(500).json({ error: "차단 해제에 실패했습니다." });
  }
});

// Check if user is banned
router.get("/bans/check/:userId", verifyAdminToken, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const result = await db.isUserBanned(userId);
    res.json(result);
  } catch (e) {
    console.error("Admin check ban error:", e);
    res.status(500).json({ error: "차단 상태 확인에 실패했습니다." });
  }
});

// ============ Admin Logs API ============
// Only full admin can view activity logs (sub-admin cannot)
router.get("/logs", verifyAdminToken, verifyFullAdmin, async (req: Request, res: Response) => {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return res.json({ logs: [] });
    
    const actionType = req.query.actionType as string | undefined;
    
    let logs;
    if (actionType) {
      logs = await dbInstance
        .select()
        .from(adminLogs)
        .where(eq(adminLogs.actionType, actionType))
        .orderBy(desc(adminLogs.createdAt))
        .limit(100);
    } else {
      logs = await dbInstance
        .select()
        .from(adminLogs)
        .orderBy(desc(adminLogs.createdAt))
        .limit(100);
    }
    res.json({ logs });
  } catch (e) {
    console.error("Admin logs error:", e);
    res.status(500).json({ error: "활동 로그를 불러오는데 실패했습니다." });
  }
});

// Serve admin dashboard HTML (inline to avoid file path issues in production)
router.get("/", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(getAdminDashboardHTML());
});

function getAdminDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SCOOP Riding - 관리자 대시보드</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .modal { display: none; }
    .modal.active { display: flex; }
    .tab-btn { transition: all 0.2s; }
    .tab-btn.active { background: #f97316; color: white; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <header class="bg-orange-500 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
          <span class="text-orange-500 font-bold text-xl">S</span>
        </div>
        <h1 class="text-xl font-bold">SCOOP Riding 관리자</h1>
      </div>
      <div class="flex items-center gap-4">
        <span id="adminEmail" class="text-sm opacity-80"></span>
        <button onclick="logout()" class="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm">로그아웃</button>
      </div>
    </div>
  </header>

  <div id="loginSection" class="max-w-md mx-auto mt-20 p-6 bg-white rounded-xl shadow-lg">
    <h2 class="text-2xl font-bold text-center mb-6">관리자 로그인</h2>
    <form onsubmit="login(event)">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
        <input type="email" id="loginEmail" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
      </div>
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input type="password" id="loginPassword" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
      </div>
      <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold">로그인</button>
      <p id="loginError" class="text-red-500 text-sm mt-2 text-center hidden"></p>
    </form>
  </div>

  <div id="dashboardSection" class="hidden">
    <div class="max-w-7xl mx-auto px-4 py-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl p-6 shadow">
          <div class="text-gray-500 text-sm">전체 사용자</div>
          <div id="statTotalUsers" class="text-3xl font-bold text-gray-800">-</div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow">
          <div class="text-gray-500 text-sm">오늘 가입</div>
          <div id="statTodayUsers" class="text-3xl font-bold text-green-600">-</div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow">
          <div class="text-gray-500 text-sm">총 주행 기록</div>
          <div id="statTotalRides" class="text-3xl font-bold text-blue-600">-</div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow">
          <div class="text-gray-500 text-sm">총 주행 거리</div>
          <div id="statTotalDistance" class="text-3xl font-bold text-orange-500">-</div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow mb-6 p-2 flex flex-wrap gap-2">
        <button onclick="switchTab('stats')" class="tab-btn active px-4 py-2 rounded-lg font-medium" data-tab="stats">통계</button>
        <button onclick="switchTab('monitoring')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="monitoring">모니터링</button>
        <button onclick="switchTab('bans')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="bans">차단 관리</button>
        <button onclick="switchTab('users')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="users">사용자 관리</button>
        <button onclick="switchTab('announcements')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="announcements">공지사항</button>
        <button onclick="switchTab('surveys')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="surveys">설문 응답</button>
        <button onclick="switchTab('bugs')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="bugs">버그 리포트</button>
        <button onclick="switchTab('posts')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="posts">게시글 관리</button>
        <button id="logsTabBtn" onclick="switchTab('logs')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="logs">활동 로그</button>
      </div>

      <div id="tab-stats" class="tab-content active">
        <!-- 차트 섹션 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-xl p-6 shadow">
            <h3 class="text-lg font-semibold mb-4">일별 가입자 추이 (최근 7일)</h3>
            <canvas id="dailyUsersChart" height="200"></canvas>
          </div>
          <div class="bg-white rounded-xl p-6 shadow">
            <h3 class="text-lg font-semibold mb-4">주별 가입자 추이 (최근 4주)</h3>
            <canvas id="weeklyUsersChart" height="200"></canvas>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-xl p-6 shadow">
            <h3 class="text-lg font-semibold mb-4">일별 주행 통계 (최근 7일)</h3>
            <canvas id="dailyRidesChart" height="200"></canvas>
          </div>
          <div class="bg-white rounded-xl p-6 shadow">
            <h3 class="text-lg font-semibold mb-4">주별 주행 통계 (최근 4주)</h3>
            <canvas id="weeklyRidesChart" height="200"></canvas>
          </div>
        </div>
        <!-- 사용자 주행 통계 조회 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-xl p-6 shadow">
            <h3 class="text-lg font-semibold mb-4">사용자 주행 통계</h3>
            <div class="mb-4">
              <input type="text" id="userStatsId" placeholder="사용자 ID 입력" class="px-4 py-2 border border-gray-300 rounded-lg mr-2" inputmode="numeric" pattern="[0-9]*">
              <button onclick="loadUserStats()" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg">조회</button>
              <button onclick="loadUserRideHistory()" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg ml-2">주행 기록</button>
            </div>
            <div id="userStatsResult" class="text-sm text-gray-600">사용자 ID를 입력하고 조회하세요.</div>
            <div id="userRideHistory" class="mt-4 hidden">
              <h4 class="font-semibold mb-2">주행 기록 목록</h4>
              <div id="rideHistoryList" class="max-h-64 overflow-y-auto"></div>
            </div>
          </div>
          <div class="bg-white rounded-xl p-6 shadow">
            <h3 class="text-lg font-semibold mb-4">주행 거리 분포 (최근 7일)</h3>
            <canvas id="dailyDistanceChart" height="200"></canvas>
          </div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow">
          <h3 class="text-lg font-semibold mb-4">주간 통계 요약</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-blue-600" id="weeklyNewUsers">-</div>
              <div class="text-sm text-gray-500">이번 주 신규 가입</div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-green-600" id="weeklyRides">-</div>
              <div class="text-sm text-gray-500">이번 주 주행 횟수</div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-orange-600" id="weeklyDistance">-</div>
              <div class="text-sm text-gray-500">이번 주 총 거리 (km)</div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-purple-600" id="weeklyPosts">-</div>
              <div class="text-sm text-gray-500">이번 주 게시글</div>
            </div>
          </div>
        </div>
      </div>

      <div id="tab-monitoring" class="tab-content">
        <div class="bg-white rounded-xl p-4 shadow mb-4">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-semibold">악성 유저 모니터링</h3>
            <button onclick="loadSuspiciousUsers()" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg">새로고침</button>
          </div>
          <p class="text-sm text-gray-500 mt-2">비정상적인 활동 패턴을 보이는 사용자를 탐지합니다.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl shadow overflow-hidden">
            <div class="bg-red-50 px-4 py-3 border-b">
              <h4 class="font-semibold text-red-700">의심 사용자 목록</h4>
            </div>
            <div id="suspiciousUsersList" class="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              <div class="px-4 py-8 text-center text-gray-500">로딩 중...</div>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow overflow-hidden">
            <div class="bg-yellow-50 px-4 py-3 border-b">
              <h4 class="font-semibold text-yellow-700">의심 활동 리포트</h4>
            </div>
            <div id="suspiciousReportsList" class="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              <div class="px-4 py-8 text-center text-gray-500">로딩 중...</div>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow mt-6">
          <h4 class="font-semibold mb-4">의심 활동 기준</h4>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div class="p-3 bg-gray-50 rounded-lg">
              <div class="font-medium text-gray-700">비정상 주행</div>
              <div class="text-gray-500">상시 앱 실행, 24시간 이상 주행, 비현실적 속도</div>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <div class="font-medium text-gray-700">스팸 게시글</div>
              <div class="text-gray-500">단시간 대량 게시, 중복 콘텐츠, 의미없는 내용</div>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <div class="font-medium text-gray-700">서버 트래픽 증가</div>
              <div class="text-gray-500">비정상적 API 호출, 동시 다중 접속</div>
            </div>
          </div>
        </div>
      </div>

      <div id="tab-bans" class="tab-content">
        <div class="bg-white rounded-xl p-4 shadow mb-4">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-semibold">차단된 사용자 목록</h3>
            <button onclick="loadBans()" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg">새로고침</button>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사용자</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">만료일</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">차단일</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
              </tr>
            </thead>
            <tbody id="bansTableBody" class="divide-y divide-gray-200">
              <tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>
            </tbody>
          </table>
        </div>
        <div class="bg-white rounded-xl p-4 shadow mt-6">
          <h4 class="font-semibold mb-4">새 차단 추가</h4>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input type="text" id="banUserId" placeholder="사용자 ID" class="px-4 py-2 border border-gray-300 rounded-lg" inputmode="numeric" pattern="[0-9]*">
            <input type="text" id="banReason" placeholder="차단 사유" class="px-4 py-2 border border-gray-300 rounded-lg">
            <select id="banType" class="px-4 py-2 border border-gray-300 rounded-lg">
              <option value="temporary">임시 차단</option>
              <option value="permanent">영구 차단</option>
            </select>
            <button onclick="banUser()" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg">차단</button>
          </div>
          <div class="mt-2">
            <input type="datetime-local" id="banExpiresAt" class="px-4 py-2 border border-gray-300 rounded-lg" placeholder="만료일 (임시 차단시)">
          </div>
        </div>
      </div>

      <div id="tab-users" class="tab-content">
        <div class="bg-white rounded-xl p-4 shadow mb-4">
          <div class="flex flex-wrap gap-4 items-center">
            <input type="text" id="searchInput" placeholder="이름 또는 이메일로 검색..." class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg" onkeyup="debounceSearch()">
            <select id="filterRole" onchange="currentUsersPage=1;loadUsers()" class="px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">전체 역할</option>
              <option value="user">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
            <button onclick="loadUsers()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg">새로고침</button>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">가입일</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
              </tr>
            </thead>
            <tbody id="usersTableBody" class="divide-y divide-gray-200">
              <tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>
            </tbody>
          </table>
          <!-- Pagination -->
          <div id="usersPagination" class="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
            <div class="flex items-center text-sm text-gray-600">
              <span>전체 <span id="usersTotalCount">0</span>명</span>
              <span class="mx-2">|</span>
              <span>페이지당</span>
              <select id="usersPerPage" onchange="changeUsersPerPage()" class="mx-2 border rounded px-2 py-1">
                <option value="10">10</option>
                <option value="20" selected>20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span>명</span>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="goToUsersPage(1)" class="px-3 py-1 rounded border hover:bg-gray-100 disabled:opacity-50" id="usersFirstBtn">&laquo;</button>
              <button onclick="goToUsersPage(currentUsersPage-1)" class="px-3 py-1 rounded border hover:bg-gray-100 disabled:opacity-50" id="usersPrevBtn">&lt;</button>
              <div id="usersPageNumbers" class="flex gap-1"></div>
              <button onclick="goToUsersPage(currentUsersPage+1)" class="px-3 py-1 rounded border hover:bg-gray-100 disabled:opacity-50" id="usersNextBtn">&gt;</button>
              <button onclick="goToUsersPage(totalUsersPages)" class="px-3 py-1 rounded border hover:bg-gray-100 disabled:opacity-50" id="usersLastBtn">&raquo;</button>
            </div>
          </div>
        </div>
      </div>

      <div id="tab-announcements" class="tab-content">
        <div class="bg-white rounded-xl p-4 shadow mb-4 flex justify-between items-center">
          <h3 class="text-lg font-semibold">공지사항 관리</h3>
          <button onclick="openAnnouncementModal()" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg">새 공지 작성</button>
        </div>
        <div id="announcementsList" class="space-y-4"></div>
      </div>

      <div id="tab-surveys" class="tab-content">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-xl p-4 shadow">
            <div class="text-gray-500 text-sm">총 응답</div>
            <div id="surveyTotal" class="text-2xl font-bold text-gray-800">-</div>
          </div>
          <div class="bg-white rounded-xl p-4 shadow">
            <div class="text-gray-500 text-sm">평균 평점</div>
            <div id="surveyAvgRating" class="text-2xl font-bold text-yellow-500">-</div>
          </div>
          <div class="bg-white rounded-xl p-4 shadow">
            <div class="text-gray-500 text-sm">추천율</div>
            <div id="surveyRecommendRate" class="text-2xl font-bold text-green-600">-</div>
          </div>
          <div class="bg-white rounded-xl p-4 shadow">
            <div class="text-gray-500 text-sm">가장 많이 사용한 기능</div>
            <div id="surveyTopFeature" class="text-lg font-bold text-blue-600">-</div>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사용자</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">평점</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">추천</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">주요 기능</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">피드백</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
              </tr>
            </thead>
            <tbody id="surveysTableBody" class="divide-y divide-gray-200">
              <tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="tab-bugs" class="tab-content">
        <div class="bg-white rounded-xl p-4 shadow mb-4">
          <h3 class="text-lg font-semibold">버그 리포트 관리</h3>
        </div>
        <div id="bugsList" class="space-y-4"></div>
      </div>

      <div id="tab-posts" class="tab-content">
        <div class="bg-white rounded-xl p-4 shadow mb-4">
          <h3 class="text-lg font-semibold">게시글 관리</h3>
        </div>
        <div id="postsList" class="space-y-4"></div>
      </div>

      <div id="tab-logs" class="tab-content">
        <div class="bg-white rounded-xl p-4 shadow mb-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">관리자 활동 로그</h3>
            <div class="flex gap-2">
              <select id="logActionFilter" onchange="loadLogs()" class="px-3 py-1 border border-gray-300 rounded-lg text-sm">
                <option value="">전체 작업</option>
                <option value="user_edit">사용자 수정</option>
                <option value="user_delete">사용자 삭제</option>
                <option value="user_ban">사용자 차단</option>
                <option value="user_unban">차단 해제</option>
                <option value="post_delete">게시글 삭제</option>
              </select>
              <button onclick="loadLogs()" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-1 rounded-lg text-sm">새로고침</button>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">시간</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">관리자</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">작업</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">대상</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">상세</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">IP</th>
              </tr>
            </thead>
            <tbody id="logsTableBody" class="divide-y divide-gray-200"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div id="userProfileModal" class="modal fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-50 overflow-y-auto">
    <div class="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 my-8">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold">사용자 상세 정보</h3>
        <button onclick="closeUserProfileModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      <div id="userProfileContent" class="space-y-6">
        <div class="text-center text-gray-500">로딩 중...</div>
      </div>
    </div>
  </div>

  <div id="editModal" class="modal fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-50">
    <div class="bg-white rounded-xl p-6 w-full max-w-md mx-4">
      <h3 class="text-xl font-bold mb-4">사용자 정보 수정</h3>
      <form onsubmit="saveUser(event)">
        <input type="hidden" id="editUserId">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input type="text" id="editName" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input type="email" id="editEmail" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">역할</label>
          <select id="editRole" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            <option value="user">일반 사용자</option>
            <option value="admin">관리자</option>
          </select>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" onclick="closeModal('editModal')" class="flex-1 px-4 py-2 bg-gray-200 rounded-lg">취소</button>
          <button type="submit" class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg">저장</button>
        </div>
      </form>
    </div>
  </div>

  <div id="announcementModal" class="modal fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-50">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
      <h3 class="text-xl font-bold mb-4" id="announcementModalTitle">새 공지사항</h3>
      <form onsubmit="saveAnnouncement(event)">
        <input type="hidden" id="announcementId">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">유형</label>
          <select id="announcementType" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            <option value="notice">공지</option>
            <option value="update">업데이트</option>
            <option value="event">이벤트</option>
            <option value="maintenance">점검</option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">제목</label>
          <input type="text" id="announcementTitle" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">내용</label>
          <textarea id="announcementContent" rows="6" required class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
        </div>
        <div class="mb-4 flex gap-4">
          <label class="flex items-center gap-2">
            <input type="checkbox" id="announcementShowPopup" checked class="rounded">
            <span class="text-sm">팝업 표시</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" id="announcementIsActive" checked class="rounded">
            <span class="text-sm">활성화</span>
          </label>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">만료일 (선택)</label>
          <input type="datetime-local" id="announcementExpiresAt" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" onclick="closeModal('announcementModal')" class="flex-1 px-4 py-2 bg-gray-200 rounded-lg">취소</button>
          <button type="submit" class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg">저장</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    const API_BASE = window.location.origin;
    let adminToken = localStorage.getItem('adminToken');
    let adminRole = localStorage.getItem('adminRole') || 'admin';
    let searchTimeout;

    // Apply role-based permissions (hide logs tab for sub-admin)
    function applyRolePermissions() {
      const logsTabBtn = document.getElementById('logsTabBtn');
      const logsTab = document.getElementById('tab-logs');
      if (adminRole === 'sub-admin') {
        if (logsTabBtn) logsTabBtn.style.display = 'none';
        if (logsTab) logsTab.style.display = 'none';
      } else {
        if (logsTabBtn) logsTabBtn.style.display = '';
        if (logsTab) logsTab.style.display = '';
      }
    }

    if (adminToken) { checkAuth(); } else { showLogin(); }

    async function checkAuth() {
      try {
        const res = await fetch(API_BASE+'/api/admin/me', { headers: { 'Authorization': 'Bearer '+adminToken } });
        if (res.ok) {
          const data = await res.json();
          adminRole = data.role || 'admin';
          localStorage.setItem('adminRole', adminRole);
          applyRolePermissions();
          showDashboard();
          loadAllData();
        } else { showLogin(); }
      } catch (e) { showLogin(); }
    }

    function showLogin() {
      document.getElementById('loginSection').classList.remove('hidden');
      document.getElementById('dashboardSection').classList.add('hidden');
    }

    function showDashboard() {
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('dashboardSection').classList.remove('hidden');
      try {
        const payload = JSON.parse(atob(adminToken.split('.')[1]));
        const roleText = adminRole === 'sub-admin' ? ' (부관리자)' : ' (주 관리자)';
        document.getElementById('adminEmail').textContent = (payload.email || '') + roleText;
      } catch (e) {}
    }

    async function login(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      try {
        const res = await fetch(API_BASE+'/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          adminToken = data.token;
          adminRole = data.role || 'admin';
          localStorage.setItem('adminToken', adminToken);
          localStorage.setItem('adminRole', adminRole);
          applyRolePermissions();
          showDashboard();
          loadAllData();
        } else {
          document.getElementById('loginError').textContent = data.error || '로그인 실패';
          document.getElementById('loginError').classList.remove('hidden');
        }
      } catch (e) {
        document.getElementById('loginError').textContent = '서버 오류';
        document.getElementById('loginError').classList.remove('hidden');
      }
    }

    function logout() {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminRole');
      adminToken = null;
      adminRole = 'admin';
      showLogin();
    }

    function loadAllData() { loadStats(); loadUsers(); loadAnnouncements(); loadSurveys(); loadBugs(); loadPosts(); loadRegistrationChart(); loadSuspiciousUsers(); loadSuspiciousReports(); loadBans(); }

    function switchTab(tab) {
      // Block sub-admin from accessing logs tab
      if (tab === 'logs' && adminRole === 'sub-admin') {
        alert('활동 로그는 주 관리자만 열람할 수 있습니다.');
        return;
      }
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="'+tab+'"]').classList.add('active');
      document.getElementById('tab-'+tab).classList.add('active');
      if (tab === 'logs') loadLogs();
    }

    // Chart instances
    let dailyUsersChartInstance = null;
    let weeklyUsersChartInstance = null;
    let dailyRidesChartInstance = null;
    let weeklyRidesChartInstance = null;
    let dailyDistanceChartInstance = null;

    async function loadStats() {
      try {
        const res = await fetch(API_BASE+'/api/admin/stats', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        document.getElementById('statTotalUsers').textContent = data.totalUsers || '0';
        document.getElementById('statTodayUsers').textContent = data.todayUsers || '0';
        document.getElementById('statTotalRides').textContent = data.totalRides || '0';
        document.getElementById('statTotalDistance').textContent = (data.totalDistance || 0).toLocaleString() + ' km';
        // Weekly stats
        document.getElementById('weeklyNewUsers').textContent = data.weeklyNewUsers || '0';
        document.getElementById('weeklyRides').textContent = data.weeklyRides || '0';
        document.getElementById('weeklyDistance').textContent = (data.weeklyDistance || 0).toLocaleString();
        document.getElementById('weeklyPosts').textContent = data.weeklyPosts || '0';
        // Load charts
        loadChartData();
      } catch (e) { console.error(e); }
    }

    async function loadChartData() {
      try {
        const res = await fetch(API_BASE+'/api/admin/chart-data', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        // Daily Users Chart
        const dailyUsersCtx = document.getElementById('dailyUsersChart').getContext('2d');
        if (dailyUsersChartInstance) dailyUsersChartInstance.destroy();
        dailyUsersChartInstance = new Chart(dailyUsersCtx, {
          type: 'bar',
          data: {
            labels: data.dailyUsers.map(d => d.label),
            datasets: [{
              label: '가입자 수',
              data: data.dailyUsers.map(d => d.count),
              backgroundColor: 'rgba(249, 115, 22, 0.7)',
              borderColor: 'rgb(249, 115, 22)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        });

        // Weekly Users Chart
        const weeklyUsersCtx = document.getElementById('weeklyUsersChart').getContext('2d');
        if (weeklyUsersChartInstance) weeklyUsersChartInstance.destroy();
        weeklyUsersChartInstance = new Chart(weeklyUsersCtx, {
          type: 'bar',
          data: {
            labels: data.weeklyUsers.map(d => d.label),
            datasets: [{
              label: '가입자 수',
              data: data.weeklyUsers.map(d => d.count),
              backgroundColor: 'rgba(59, 130, 246, 0.7)',
              borderColor: 'rgb(59, 130, 246)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        });

        // Daily Rides Chart (dual axis: count + distance)
        const dailyRidesCtx = document.getElementById('dailyRidesChart').getContext('2d');
        if (dailyRidesChartInstance) dailyRidesChartInstance.destroy();
        dailyRidesChartInstance = new Chart(dailyRidesCtx, {
          type: 'bar',
          data: {
            labels: data.dailyRides.map(d => d.label),
            datasets: [{
              label: '주행 횟수',
              data: data.dailyRides.map(d => d.count),
              backgroundColor: 'rgba(34, 197, 94, 0.7)',
              borderColor: 'rgb(34, 197, 94)',
              borderWidth: 1,
              yAxisID: 'y'
            }, {
              label: '거리 (km)',
              data: data.dailyRides.map(d => d.distance),
              type: 'line',
              borderColor: 'rgb(168, 85, 247)',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              tension: 0.3,
              yAxisID: 'y1'
            }]
          },
          options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
              y: { type: 'linear', display: true, position: 'left', beginAtZero: true, ticks: { stepSize: 1 } },
              y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
            }
          }
        });

        // Weekly Rides Chart
        const weeklyRidesCtx = document.getElementById('weeklyRidesChart').getContext('2d');
        if (weeklyRidesChartInstance) weeklyRidesChartInstance.destroy();
        weeklyRidesChartInstance = new Chart(weeklyRidesCtx, {
          type: 'bar',
          data: {
            labels: data.weeklyRides.map(d => d.label),
            datasets: [{
              label: '주행 횟수',
              data: data.weeklyRides.map(d => d.count),
              backgroundColor: 'rgba(34, 197, 94, 0.7)',
              borderColor: 'rgb(34, 197, 94)',
              borderWidth: 1,
              yAxisID: 'y'
            }, {
              label: '거리 (km)',
              data: data.weeklyRides.map(d => d.distance),
              type: 'line',
              borderColor: 'rgb(168, 85, 247)',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              tension: 0.3,
              yAxisID: 'y1'
            }]
          },
          options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
              y: { type: 'linear', display: true, position: 'left', beginAtZero: true, ticks: { stepSize: 1 } },
              y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
            }
          }
        });

        // Daily Distance Chart
        const dailyDistanceCtx = document.getElementById('dailyDistanceChart').getContext('2d');
        if (dailyDistanceChartInstance) dailyDistanceChartInstance.destroy();
        dailyDistanceChartInstance = new Chart(dailyDistanceCtx, {
          type: 'line',
          data: {
            labels: data.dailyRides.map(d => d.label),
            datasets: [{
              label: '주행 거리 (km)',
              data: data.dailyRides.map(d => d.distance),
              borderColor: 'rgb(249, 115, 22)',
              backgroundColor: 'rgba(249, 115, 22, 0.2)',
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });
      } catch (e) { console.error('Chart load error:', e); }
    }

    function debounceSearch() { clearTimeout(searchTimeout); searchTimeout = setTimeout(function() { currentUsersPage = 1; loadUsers(); }, 300); }

    // Pagination state
    var currentUsersPage = 1;
    var totalUsersPages = 1;
    var usersPerPage = 20;

    async function loadUsers() {
      const search = document.getElementById('searchInput').value;
      const role = document.getElementById('filterRole').value;
      try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (role) params.append('role', role);
        params.append('page', currentUsersPage.toString());
        params.append('limit', usersPerPage.toString());
        const res = await fetch(API_BASE+'/api/admin/users?'+params.toString(), { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        renderUsers(data.users || []);
        updateUsersPagination(data.total || 0, data.totalPages || 1, data.page || 1);
      } catch (e) { console.error(e); }
    }

    function updateUsersPagination(total, totalPages, page) {
      totalUsersPages = totalPages;
      currentUsersPage = page;
      document.getElementById('usersTotalCount').textContent = total;
      
      // Update buttons state
      document.getElementById('usersFirstBtn').disabled = page <= 1;
      document.getElementById('usersPrevBtn').disabled = page <= 1;
      document.getElementById('usersNextBtn').disabled = page >= totalPages;
      document.getElementById('usersLastBtn').disabled = page >= totalPages;
      
      // Generate page numbers
      var pageNumbers = document.getElementById('usersPageNumbers');
      var html = '';
      var startPage = Math.max(1, page - 2);
      var endPage = Math.min(totalPages, page + 2);
      
      if (startPage > 1) {
        html += '<button onclick="goToUsersPage(1)" class="px-3 py-1 rounded border hover:bg-gray-100">1</button>';
        if (startPage > 2) html += '<span class="px-2">…</span>';
      }
      
      for (var i = startPage; i <= endPage; i++) {
        if (i === page) {
          html += '<button class="px-3 py-1 rounded bg-orange-500 text-white">' + i + '</button>';
        } else {
          html += '<button onclick="goToUsersPage(' + i + ')" class="px-3 py-1 rounded border hover:bg-gray-100">' + i + '</button>';
        }
      }
      
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += '<span class="px-2">…</span>';
        html += '<button onclick="goToUsersPage(' + totalPages + ')" class="px-3 py-1 rounded border hover:bg-gray-100">' + totalPages + '</button>';
      }
      
      pageNumbers.innerHTML = html;
    }

    function goToUsersPage(page) {
      if (page < 1 || page > totalUsersPages) return;
      currentUsersPage = page;
      loadUsers();
    }

    function changeUsersPerPage() {
      usersPerPage = parseInt(document.getElementById('usersPerPage').value);
      currentUsersPage = 1;
      loadUsers();
    }

    function renderUsers(users) {
      var tbody = document.getElementById('usersTableBody');
      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">사용자가 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = users.map(function(u) {
        var roleClass = u.role==='admin' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800';
        var roleText = u.role==='admin' ? '관리자' : '사용자';
        return '<tr class="hover:bg-gray-50">' +
          '<td class="px-4 py-3 text-sm">' + u.id + '</td>' +
          '<td class="px-4 py-3 text-sm font-medium">' + (u.name || '-') + '</td>' +
          '<td class="px-4 py-3 text-sm">' + u.email + '</td>' +
          '<td class="px-4 py-3 text-sm"><span class="px-2 py-1 rounded text-xs ' + roleClass + '">' + roleText + '</span></td>' +
          '<td class="px-4 py-3 text-sm text-gray-600">' + formatDate(u.createdAt) + '</td>' +
          '<td class="px-4 py-3 text-sm">' +
            '<button onclick="viewUserProfile(' + u.id + ')" class="text-green-600 hover:text-green-800 mr-2">상세</button>' +
            '<button onclick="editUser(' + u.id + ')" class="text-blue-600 hover:text-blue-800 mr-2">수정</button>' +
            '<button onclick="deleteUser(' + u.id + ')" class="text-red-600 hover:text-red-800">삭제</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function editUser(id) {
      try {
        const res = await fetch(API_BASE+'/api/admin/users/'+id, { headers: { 'Authorization': 'Bearer '+adminToken } });
        const user = await res.json();
        if (user) {
          document.getElementById('editUserId').value = user.id;
          document.getElementById('editName').value = user.name || '';
          document.getElementById('editEmail').value = user.email;
          document.getElementById('editRole').value = user.role || 'user';
          document.getElementById('editModal').classList.add('active');
        }
      } catch (e) { alert('사용자 정보를 불러오는데 실패했습니다.'); }
    }

    async function saveUser(e) {
      e.preventDefault();
      const id = document.getElementById('editUserId').value;
      const data = {
        name: document.getElementById('editName').value,
        email: document.getElementById('editEmail').value,
        role: document.getElementById('editRole').value
      };
      try {
        const res = await fetch(API_BASE+'/api/admin/users/'+id, {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) { closeModal('editModal'); loadUsers(); alert('사용자 정보가 수정되었습니다.'); }
        else { const err = await res.json(); alert(err.error || '수정 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    async function deleteUser(id) {
      if (!confirm('정말로 이 사용자를 삭제하시겠습니까?')) return;
      try {
        const res = await fetch(API_BASE+'/api/admin/users/'+id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer '+adminToken }
        });
        if (res.ok) { loadUsers(); alert('사용자가 삭제되었습니다.'); }
        else { const err = await res.json(); alert(err.error || '삭제 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    async function loadAnnouncements() {
      try {
        const res = await fetch(API_BASE+'/api/admin/announcements', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        renderAnnouncements(data);
      } catch (e) { console.error(e); }
    }

    function renderAnnouncements(announcements) {
      const container = document.getElementById('announcementsList');
      if (announcements.length === 0) {
        container.innerHTML = '<div class="bg-white rounded-xl p-8 shadow text-center text-gray-500">공지사항이 없습니다.</div>';
        return;
      }
      container.innerHTML = announcements.map(a => \`
        <div class="bg-white rounded-xl p-4 shadow">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="flex gap-2 mb-2">
                <span class="px-2 py-1 rounded text-xs \${a.isActive?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'}">\${a.isActive?'활성':'비활성'}</span>
                <span class="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">\${getTypeLabel(a.type)}</span>
                \${a.showPopup?'<span class="px-2 py-1 rounded text-xs bg-orange-100 text-orange-800">팝업</span>':''}
              </div>
              <h4 class="font-semibold mb-1">\${a.title}</h4>
              <p class="text-gray-600 text-sm">\${a.content.substring(0, 100)}\${a.content.length > 100 ? '...' : ''}</p>
              <p class="text-gray-400 text-xs mt-2">\${formatDate(a.createdAt)}</p>
            </div>
            <div class="flex gap-2 ml-4">
              <button onclick="editAnnouncement(\${a.id})" class="text-blue-600 hover:text-blue-800 text-sm">수정</button>
              <button onclick="deleteAnnouncement(\${a.id})" class="text-red-600 hover:text-red-800 text-sm">삭제</button>
            </div>
          </div>
        </div>
      \`).join('');
    }

    function getTypeLabel(type) {
      switch(type) {
        case 'update': return '업데이트';
        case 'event': return '이벤트';
        case 'maintenance': return '점검';
        default: return '공지';
      }
    }

    function openAnnouncementModal(announcement = null) {
      document.getElementById('announcementModalTitle').textContent = announcement ? '공지사항 수정' : '새 공지사항';
      document.getElementById('announcementId').value = announcement?.id || '';
      document.getElementById('announcementType').value = announcement?.type || 'notice';
      document.getElementById('announcementTitle').value = announcement?.title || '';
      document.getElementById('announcementContent').value = announcement?.content || '';
      document.getElementById('announcementShowPopup').checked = announcement?.showPopup ?? true;
      document.getElementById('announcementIsActive').checked = announcement?.isActive ?? true;
      document.getElementById('announcementExpiresAt').value = announcement?.expiresAt ? new Date(announcement.expiresAt).toISOString().slice(0, 16) : '';
      document.getElementById('announcementModal').classList.add('active');
    }

    async function editAnnouncement(id) {
      try {
        const res = await fetch(API_BASE+'/api/admin/announcements', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        const announcement = data.find(a => a.id === id);
        if (announcement) openAnnouncementModal(announcement);
      } catch (e) { alert('공지사항을 불러오는데 실패했습니다.'); }
    }

    async function saveAnnouncement(e) {
      e.preventDefault();
      const id = document.getElementById('announcementId').value;
      const data = {
        type: document.getElementById('announcementType').value,
        title: document.getElementById('announcementTitle').value,
        content: document.getElementById('announcementContent').value,
        showPopup: document.getElementById('announcementShowPopup').checked,
        isActive: document.getElementById('announcementIsActive').checked,
        expiresAt: document.getElementById('announcementExpiresAt').value || null
      };
      try {
        const url = id ? API_BASE+'/api/admin/announcements/'+id : API_BASE+'/api/admin/announcements';
        const res = await fetch(url, {
          method: id ? 'PUT' : 'POST',
          headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) { closeModal('announcementModal'); loadAnnouncements(); alert(id ? '공지사항이 수정되었습니다.' : '공지사항이 생성되었습니다.'); }
        else { const err = await res.json(); alert(err.error || '저장 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    async function deleteAnnouncement(id) {
      if (!confirm('정말로 이 공지사항을 삭제하시겠습니까?')) return;
      try {
        const res = await fetch(API_BASE+'/api/admin/announcements/'+id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer '+adminToken }
        });
        if (res.ok) { loadAnnouncements(); alert('공지사항이 삭제되었습니다.'); }
        else { const err = await res.json(); alert(err.error || '삭제 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    async function loadSurveys() {
      try {
        const res = await fetch(API_BASE+'/api/admin/surveys', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        document.getElementById('surveyTotal').textContent = data.stats.totalResponses || '0';
        document.getElementById('surveyAvgRating').textContent = data.stats.avgRating || '-';
        document.getElementById('surveyRecommendRate').textContent = (data.stats.recommendRate || '0') + '%';
        const featureStats = data.stats.featureStats || {};
        const topFeature = Object.entries(featureStats).sort((a,b) => b[1] - a[1])[0];
        document.getElementById('surveyTopFeature').textContent = topFeature ? getFeatureLabel(topFeature[0]) : '-';
        renderSurveys(data.responses || []);
      } catch (e) { console.error(e); }
    }

    function getFeatureLabel(feature) {
      const labels = { 'solo_riding': '개인 주행', 'group_riding': '그룹 라이딩', 'statistics': '통계/분석', 'community': '커뮤니티', 'challenges': '챌린지' };
      return labels[feature] || feature;
    }

    function renderSurveys(responses) {
      const tbody = document.getElementById('surveysTableBody');
      if (responses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">설문 응답이 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = responses.map(r => \`
        <tr class="hover:bg-gray-50">
          <td class="px-4 py-3 text-sm">\${r.userName || r.userEmail || 'ID:'+r.userId}</td>
          <td class="px-4 py-3 text-sm">\${'\u2b50'.repeat(r.rating || 0)}</td>
          <td class="px-4 py-3 text-sm">\${r.wouldRecommend ? '\u2705 예' : '\u274c 아니오'}</td>
          <td class="px-4 py-3 text-sm">\${getFeatureLabel(r.mostUsedFeature)}</td>
          <td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title="\${r.feedback || ''}">\${r.feedback || '-'}</td>
          <td class="px-4 py-3 text-sm text-gray-600">\${formatDate(r.createdAt)}</td>
        </tr>
      \`).join('');
    }

    async function loadBugs() {
      try {
        const res = await fetch(API_BASE+'/api/admin/bugs', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        renderBugs(data);
      } catch (e) { console.error(e); }
    }

    function renderBugs(bugs) {
      const container = document.getElementById('bugsList');
      if (bugs.length === 0) {
        container.innerHTML = '<div class="bg-white rounded-xl p-8 shadow text-center text-gray-500">버그 리포트가 없습니다.</div>';
        return;
      }
      container.innerHTML = bugs.map(b => \`
        <div class="bg-white rounded-xl p-4 shadow">
          <div class="flex justify-between items-start mb-2">
            <div class="flex gap-2 flex-wrap">
              <span class="px-2 py-1 rounded text-xs \${getSeverityColor(b.severity)}">\${getSeverityLabel(b.severity)}</span>
              <span class="px-2 py-1 rounded text-xs \${getStatusColor(b.status)}">\${getStatusLabel(b.status)}</span>
            </div>
            <select onchange="updateBugStatus(\${b.id}, this.value)" class="text-sm border rounded px-2 py-1">
              <option value="pending" \${b.status==='pending'?'selected':''}>대기</option>
              <option value="in_progress" \${b.status==='in_progress'?'selected':''}>처리 중</option>
              <option value="resolved" \${b.status==='resolved'?'selected':''}>해결됨</option>
            </select>
          </div>
          <h4 class="font-semibold mb-1">\${b.title}</h4>
          <p class="text-gray-600 text-sm mb-2">\${b.description}</p>
          \${b.stepsToReproduce ? '<p class="text-gray-500 text-xs mb-2"><strong>재현 방법:</strong> '+b.stepsToReproduce+'</p>' : ''}
          \${b.deviceInfo ? '<p class="text-gray-400 text-xs mb-2">기기: '+b.deviceInfo+'</p>' : ''}
          \${renderScreenshots(b.screenshotUrls)}
          \${b.adminNotes ? '<div class="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200"><p class="text-xs font-semibold text-orange-700 mb-1">관리자 답변:</p><p class="text-sm text-gray-700 whitespace-pre-wrap">'+escapeHtml(b.adminNotes)+'</p></div>' : ''}
          <div class="mt-3 border-t pt-3">
            <div class="flex gap-2">
              <input type="text" id="reply-\${b.id}" placeholder="사용자에게 답변을 작성하세요..." class="flex-1 text-sm px-3 py-2 border rounded-lg">
              <button onclick="sendBugReply(\${b.id})" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm">답변 전송</button>
            </div>
          </div>
          <div class="mt-2 text-xs text-gray-400">
            신고자: \${b.userName || b.userEmail || 'ID:'+b.userId} \u00b7 \${formatDate(b.createdAt)}
          </div>
        </div>
      \`).join('');
    }

    function renderScreenshots(screenshots) {
      if (!screenshots) return '';
      try {
        const urls = JSON.parse(screenshots);
        if (!urls || urls.length === 0) return '';
        return '<div class="flex gap-2 mt-2">' + urls.map(function(url) { return '<img src="'+url+'" class="w-20 h-20 object-cover rounded cursor-pointer" onclick="window.open(this.src)">'; }).join('') + '</div>';
      } catch (e) { return ''; }
    }

    function getSeverityColor(severity) {
      switch(severity) {
        case 'critical': return 'bg-red-100 text-red-800';
        case 'high': return 'bg-orange-100 text-orange-800';
        case 'medium': return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    }

    function getSeverityLabel(severity) {
      switch(severity) {
        case 'critical': return '심각';
        case 'high': return '높음';
        case 'medium': return '보통';
        default: return '낮음';
      }
    }

    function getStatusColor(status) {
      switch(status) {
        case 'resolved': return 'bg-green-100 text-green-800';
        case 'in_progress': return 'bg-blue-100 text-blue-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    }

    function getStatusLabel(status) {
      switch(status) {
        case 'resolved': return '해결됨';
        case 'in_progress': return '처리 중';
        default: return '대기';
      }
    }

    async function updateBugStatus(id, status) {
      try {
        const res = await fetch(API_BASE+'/api/admin/bugs/'+id+'/status', {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (res.ok) { loadBugs(); }
        else { const err = await res.json(); alert(err.error || '상태 변경 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function sendBugReply(bugId) {
      const input = document.getElementById('reply-'+bugId);
      const message = input.value.trim();
      if (!message) {
        alert('답변 내용을 입력해주세요.');
        return;
      }
      try {
        const res = await fetch(API_BASE+'/api/admin/bugs/'+bugId+'/reply', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        if (res.ok) {
          alert('답변이 전송되었습니다. 사용자에게 알림이 발송됩니다.');
          input.value = '';
          loadBugs();
        } else {
          const err = await res.json();
          alert(err.error || '답변 전송 실패');
        }
      } catch (e) {
        console.error(e);
        alert('서버 오류');
      }
    }

    async function loadPosts() {
      try {
        const res = await fetch(API_BASE+'/api/admin/posts', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        renderPosts(data);
      } catch (e) { console.error(e); }
    }

    function renderPosts(posts) {
      const container = document.getElementById('postsList');
      if (posts.length === 0) {
        container.innerHTML = '<div class="bg-white rounded-xl p-8 shadow text-center text-gray-500">게시글이 없습니다.</div>';
        return;
      }
      container.innerHTML = posts.map(p => \`
        <div class="bg-white rounded-xl p-4 shadow">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="text-sm text-gray-500 mb-1">\${p.authorName || p.authorEmail || 'ID:'+p.authorId} \u00b7 \${formatDate(p.createdAt)}</div>
              <p class="text-gray-800">\${p.content}</p>
              \${renderPostImages(p.imageUrls)}
              <div class="flex gap-4 mt-2 text-xs text-gray-500">
                <span>\u2764\ufe0f \${p.likeCount || 0}</span>
                <span>\ud83d\udcac \${p.commentCount || 0}</span>
                <span>\ud83d\udc41 \${p.viewCount || 0}</span>
              </div>
            </div>
            <button onclick="deletePost(\${p.id})" class="text-red-600 hover:text-red-800 text-sm ml-4">삭제</button>
          </div>
        </div>
      \`).join('');
    }

    function renderPostImages(imageUrls) {
      if (!imageUrls) return '';
      try {
        const urls = JSON.parse(imageUrls);
        if (!urls || urls.length === 0) return '';
        return '<div class="flex gap-2 mt-2">' + urls.map(url => '<img src="'+url+'" class="w-16 h-16 object-cover rounded">').join('') + '</div>';
      } catch (e) { return ''; }
    }

    async function deletePost(id) {
      if (!confirm('정말로 이 게시글을 삭제하시겠습니까?')) return;
      try {
        const res = await fetch(API_BASE+'/api/admin/posts/'+id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer '+adminToken }
        });
        if (res.ok) { loadPosts(); alert('게시글이 삭제되었습니다.'); }
        else { const err = await res.json(); alert(err.error || '삭제 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    function formatDate(d) { 
      if (!d) return '-'; 
      return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); 
    }

    // ========== Statistics Functions ==========
    let registrationChart = null;

    async function loadRegistrationChart() {
      try {
        const res = await fetch(API_BASE+'/api/admin/stats/registrations?days=30', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        const ctx = document.getElementById('registrationChart');
        if (!ctx) return;
        
        if (registrationChart) registrationChart.destroy();
        
        // Simple canvas chart
        const canvas = ctx.getContext('2d');
        const width = ctx.width;
        const height = ctx.height;
        
        canvas.clearRect(0, 0, width, height);
        
        if (data.length === 0) {
          canvas.fillStyle = '#666';
          canvas.font = '14px sans-serif';
          canvas.fillText('데이터가 없습니다', width/2-40, height/2);
          return;
        }
        
        const maxCount = Math.max(...data.map(d => d.count), 1);
        const barWidth = (width - 60) / data.length;
        
        // Draw bars
        data.forEach((d, i) => {
          const barHeight = (d.count / maxCount) * (height - 40);
          const x = 30 + i * barWidth;
          const y = height - 20 - barHeight;
          
          canvas.fillStyle = '#f97316';
          canvas.fillRect(x, y, barWidth - 2, barHeight);
          
          // Draw count on top
          if (d.count > 0) {
            canvas.fillStyle = '#333';
            canvas.font = '10px sans-serif';
            canvas.fillText(d.count, x + barWidth/2 - 5, y - 5);
          }
        });
        
        // Calculate weekly stats
        const weeklyData = data.slice(-7);
        const weeklyNewUsers = weeklyData.reduce((sum, d) => sum + d.count, 0);
        document.getElementById('weeklyNewUsers').textContent = weeklyNewUsers;
      } catch (e) { console.error('Registration chart error:', e); }
    }

    async function loadUserStats() {
      const userId = document.getElementById('userStatsId').value;
      if (!userId) { alert('사용자 ID를 입력하세요'); return; }
      
      try {
        const res = await fetch(API_BASE+'/api/admin/stats/user/'+userId, { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        if (data.error) {
          document.getElementById('userStatsResult').innerHTML = '<span class="text-red-500">'+data.error+'</span>';
          return;
        }
        
        document.getElementById('userStatsResult').innerHTML = 
          '<div class="grid grid-cols-2 gap-4 mt-4">' +
            '<div class="p-3 bg-gray-50 rounded-lg">' +
              '<div class="text-xl font-bold text-blue-600">' + (data.totalRides || 0) + '</div>' +
              '<div class="text-xs text-gray-500">총 주행 횟수</div>' +
            '</div>' +
            '<div class="p-3 bg-gray-50 rounded-lg">' +
              '<div class="text-xl font-bold text-green-600">' + (data.totalDistance || 0).toFixed(1) + ' km</div>' +
              '<div class="text-xs text-gray-500">총 주행 거리</div>' +
            '</div>' +
            '<div class="p-3 bg-gray-50 rounded-lg">' +
              '<div class="text-xl font-bold text-orange-600">' + Math.floor((data.totalDuration || 0) / 60) + '분</div>' +
              '<div class="text-xs text-gray-500">총 주행 시간</div>' +
            '</div>' +
            '<div class="p-3 bg-gray-50 rounded-lg">' +
              '<div class="text-xl font-bold text-purple-600">' + (data.avgSpeed || 0).toFixed(1) + ' km/h</div>' +
              '<div class="text-xs text-gray-500">평균 속도</div>' +
            '</div>' +
            '<div class="p-3 bg-gray-50 rounded-lg">' +
              '<div class="text-xl font-bold text-red-600">' + (data.maxSpeed || 0).toFixed(1) + ' km/h</div>' +
              '<div class="text-xs text-gray-500">최고 속도</div>' +
            '</div>' +
            '<div class="p-3 bg-gray-50 rounded-lg">' +
              '<div class="text-xl font-bold text-gray-600">' + formatDate(data.lastRideDate) + '</div>' +
              '<div class="text-xs text-gray-500">마지막 주행</div>' +
            '</div>' +
          '</div>';
      } catch (e) { 
        document.getElementById('userStatsResult').innerHTML = '<span class="text-red-500">오류가 발생했습니다</span>';
      }
    }

    async function loadUserRideHistory() {
      const userId = document.getElementById('userStatsId').value;
      if (!userId) { alert('사용자 ID를 입력하세요'); return; }
      
      try {
        const res = await fetch(API_BASE+'/api/admin/rides/user/'+userId, { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        const container = document.getElementById('userRideHistory');
        const listContainer = document.getElementById('rideHistoryList');
        
        if (data.error) {
          listContainer.innerHTML = '<span class="text-red-500">'+data.error+'</span>';
          container.classList.remove('hidden');
          return;
        }
        
        if (!data.rides || data.rides.length === 0) {
          listContainer.innerHTML = '<div class="text-gray-500 text-center py-4">주행 기록이 없습니다.</div>';
          container.classList.remove('hidden');
          return;
        }
        
        listContainer.innerHTML = '<table class="w-full text-sm"><thead><tr class="bg-gray-100"><th class="px-2 py-1 text-left">날짜</th><th class="px-2 py-1 text-right">거리</th><th class="px-2 py-1 text-right">시간</th><th class="px-2 py-1 text-right">평균속도</th><th class="px-2 py-1 text-right">최고속도</th></tr></thead><tbody>' +
          data.rides.map(function(r) {
            return '<tr class="border-b hover:bg-gray-50">' +
              '<td class="px-2 py-2">' + formatDate(r.createdAt) + '</td>' +
              '<td class="px-2 py-2 text-right">' + (r.distance / 1000).toFixed(2) + ' km</td>' +
              '<td class="px-2 py-2 text-right">' + Math.floor(r.duration / 60) + '분 ' + (r.duration % 60) + '초</td>' +
              '<td class="px-2 py-2 text-right">' + (r.avgSpeed || 0).toFixed(1) + ' km/h</td>' +
              '<td class="px-2 py-2 text-right">' + (r.maxSpeed || 0).toFixed(1) + ' km/h</td>' +
            '</tr>';
          }).join('') + '</tbody></table>';
        container.classList.remove('hidden');
      } catch (e) { 
        document.getElementById('rideHistoryList').innerHTML = '<span class="text-red-500">오류가 발생했습니다</span>';
        document.getElementById('userRideHistory').classList.remove('hidden');
      }
    }

    // ========== Monitoring Functions ==========
    async function loadSuspiciousUsers() {
      try {
        const res = await fetch(API_BASE+'/api/admin/monitoring/suspicious', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        const container = document.getElementById('suspiciousUsersList');
        if (data.length === 0) {
          container.innerHTML = '<div class="px-4 py-8 text-center text-gray-500">의심 사용자가 없습니다</div>';
          return;
        }
        
        container.innerHTML = data.map(function(u) {
          return '<div class="px-4 py-3 hover:bg-gray-50">' +
            '<div class="flex justify-between items-start">' +
              '<div>' +
                '<div class="font-medium">' + (u.name || '이름 없음') + '</div>' +
                '<div class="text-sm text-gray-500">' + (u.email || '') + '</div>' +
                '<div class="text-xs text-red-500 mt-1">위험도: ' + (u.suspiciousScore || 0) + '점</div>' +
              '</div>' +
              '<button onclick="banUserQuick(' + u.id + ', \"' + (u.name || '').replace(/"/g, '&quot;') + '\")" ' +
                'class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">차단</button>' +
            '</div>' +
          '</div>';
        }).join('');
      } catch (e) { 
        document.getElementById('suspiciousUsersList').innerHTML = '<div class="px-4 py-8 text-center text-red-500">로드 실패</div>';
      }
    }

    async function loadSuspiciousReports() {
      try {
        const res = await fetch(API_BASE+'/api/admin/monitoring/reports?unreviewed=true', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        const container = document.getElementById('suspiciousReportsList');
        if (data.length === 0) {
          container.innerHTML = '<div class="px-4 py-8 text-center text-gray-500">미검토 리포트가 없습니다</div>';
          return;
        }
        
        container.innerHTML = data.map(function(r) {
          return '<div class="px-4 py-3 hover:bg-gray-50">' +
            '<div class="flex justify-between items-start">' +
              '<div>' +
                '<div class="font-medium text-sm">' + (r.reportType || '알 수 없음') + '</div>' +
                '<div class="text-xs text-gray-500">사용자: ' + (r.userName || 'ID:'+r.userId) + '</div>' +
                '<div class="text-xs text-gray-400">' + (r.details || '') + '</div>' +
                '<div class="text-xs text-orange-500 mt-1">심각도: ' + (r.severityScore || 0) + '</div>' +
              '</div>' +
              '<button onclick="reviewReport(' + r.id + ')" ' +
                'class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">검토</button>' +
            '</div>' +
          '</div>';
        }).join('');
      } catch (e) { 
        document.getElementById('suspiciousReportsList').innerHTML = '<div class="px-4 py-8 text-center text-red-500">로드 실패</div>';
      }
    }

    async function reviewReport(reportId) {
      const action = prompt('조치를 선택하세요 (none/warning/temporary_ban/permanent_ban):', 'none');
      if (!action) return;
      
      const notes = prompt('검토 메모:');
      
      try {
        const res = await fetch(API_BASE+'/api/admin/monitoring/reports/'+reportId+'/review', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, notes })
        });
        if (res.ok) { loadSuspiciousReports(); alert('검토 완료'); }
        else { alert('검토 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    // ========== Ban Functions ==========
    async function loadBans() {
      try {
        const res = await fetch(API_BASE+'/api/admin/bans', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        const tbody = document.getElementById('bansTableBody');
        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">차단된 사용자가 없습니다</td></tr>';
          return;
        }
        
        tbody.innerHTML = data.map(function(b) {
          var banTypeClass = b.banType === 'permanent' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
          var banTypeText = b.banType === 'permanent' ? '영구' : '임시';
          return '<tr class="hover:bg-gray-50">' +
            '<td class="px-4 py-3">' +
              '<div class="font-medium">' + (b.name || 'ID:'+b.userId) + '</div>' +
              '<div class="text-xs text-gray-500">' + (b.email || '') + '</div>' +
            '</td>' +
            '<td class="px-4 py-3 text-sm">' + (b.reason || '-') + '</td>' +
            '<td class="px-4 py-3">' +
              '<span class="px-2 py-1 text-xs rounded ' + banTypeClass + '">' + banTypeText + '</span>' +
            '</td>' +
            '<td class="px-4 py-3 text-sm">' + (b.expiresAt ? formatDate(b.expiresAt) : '-') + '</td>' +
            '<td class="px-4 py-3 text-sm">' + formatDate(b.createdAt) + '</td>' +
            '<td class="px-4 py-3">' +
              '<button onclick="unbanUser(' + b.userId + ')" class="text-blue-600 hover:text-blue-800 text-sm">해제</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      } catch (e) { 
        document.getElementById('bansTableBody').innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">로드 실패</td></tr>';
      }
    }

    async function banUser() {
      const userId = document.getElementById('banUserId').value;
      const reason = document.getElementById('banReason').value;
      const banType = document.getElementById('banType').value;
      const expiresAt = document.getElementById('banExpiresAt').value;
      
      if (!userId) { alert('사용자 ID를 입력하세요'); return; }
      if (!reason) { alert('차단 사유를 입력하세요'); return; }
      
      try {
        const res = await fetch(API_BASE+'/api/admin/bans', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: parseInt(userId), reason, banType, expiresAt: expiresAt || undefined })
        });
        if (res.ok) {
          loadBans();
          document.getElementById('banUserId').value = '';
          document.getElementById('banReason').value = '';
          document.getElementById('banExpiresAt').value = '';
          alert('차단 완료');
        } else {
          const err = await res.json();
          alert(err.error || '차단 실패');
        }
      } catch (e) { alert('서버 오류'); }
    }

    async function banUserQuick(userId, userName) {
      const reason = prompt('"' + userName + '" 사용자를 차단합니다. 사유를 입력하세요:');
      if (!reason) return;
      
      const banType = confirm('영구 차단하시겠습니까? (취소 = 임시 차단)') ? 'permanent' : 'temporary';
      
      try {
        const res = await fetch(API_BASE+'/api/admin/bans', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, reason, banType })
        });
        if (res.ok) {
          loadBans();
          loadSuspiciousUsers();
          alert('차단 완료');
        } else {
          const err = await res.json();
          alert(err.error || '차단 실패');
        }
      } catch (e) { alert('서버 오류'); }
    }

    async function unbanUser(userId) {
      if (!confirm('정말로 차단을 해제하시겠습니까?')) return;
      
      try {
        const res = await fetch(API_BASE+'/api/admin/bans/'+userId, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer '+adminToken }
        });
        if (res.ok) { loadBans(); alert('차단 해제 완료'); }
        else { alert('해제 실패'); }
      } catch (e) { alert('서버 오류'); }
    }

    async function loadLogs() {
      try {
        const actionFilter = document.getElementById('logActionFilter').value;
        const url = API_BASE+'/api/admin/logs' + (actionFilter ? '?actionType='+actionFilter : '');
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        
        const tbody = document.getElementById('logsTableBody');
        if (!data.logs || data.logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">활동 로그가 없습니다</td></tr>';
          return;
        }
        
        const actionLabels = {
          'user_edit': '사용자 수정',
          'user_delete': '사용자 삭제',
          'user_ban': '사용자 차단',
          'user_unban': '차단 해제',
          'post_delete': '게시글 삭제'
        };
        
        tbody.innerHTML = data.logs.map(function(log) {
          var details = '';
          if (log.details) {
            try {
              var d = JSON.parse(log.details);
              if (d.before && d.after) {
                details = '변경: ' + JSON.stringify(d.before) + ' → ' + JSON.stringify(d.after);
              } else if (d.deletedUser) {
                details = '삭제된 사용자: ' + (d.deletedUser.name || d.deletedUser.email || 'ID:'+log.targetId);
              } else if (d.reason) {
                details = '사유: ' + d.reason;
              } else {
                details = JSON.stringify(d);
              }
            } catch (e) { details = log.details; }
          }
          
          return '<tr class="hover:bg-gray-50">' +
            '<td class="px-4 py-3 text-sm">' + formatDate(log.createdAt) + '</td>' +
            '<td class="px-4 py-3 text-sm">' + log.adminEmail + '</td>' +
            '<td class="px-4 py-3"><span class="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">' + (actionLabels[log.actionType] || log.actionType) + '</span></td>' +
            '<td class="px-4 py-3 text-sm">' + log.targetType + ' #' + log.targetId + '</td>' +
            '<td class="px-4 py-3 text-xs text-gray-600 max-w-xs truncate" title="' + details.replace(/"/g, '&quot;') + '">' + (details.length > 50 ? details.substring(0, 50) + '...' : details) + '</td>' +
            '<td class="px-4 py-3 text-xs text-gray-500">' + (log.ipAddress || '-') + '</td>' +
          '</tr>';
        }).join('');
      } catch (e) {
        document.getElementById('logsTableBody').innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">로드 실패</td></tr>';
      }
    }

    async function viewUserProfile(userId) {
      document.getElementById('userProfileModal').classList.add('active');
      document.getElementById('userProfileContent').innerHTML = '<div class="text-center text-gray-500">로딩 중...</div>';
      
      try {
        var res = await fetch(API_BASE+'/api/admin/users/'+userId+'/profile', { headers: { 'Authorization': 'Bearer '+adminToken } });
        var data = await res.json();
        
        var html = '';
        
        // 기본 정보
        html += '<div class="bg-gray-50 rounded-lg p-4">';
        html += '<h4 class="font-semibold mb-3">기본 정보</h4>';
        html += '<div class="grid grid-cols-2 gap-4 text-sm">';
        html += '<div><span class="text-gray-500">ID:</span> ' + data.user.id + '</div>';
        html += '<div><span class="text-gray-500">이름:</span> ' + (data.user.name || '-') + '</div>';
        html += '<div><span class="text-gray-500">이메일:</span> ' + data.user.email + '</div>';
        html += '<div><span class="text-gray-500">역할:</span> ' + (data.user.role === 'admin' ? '관리자' : '사용자') + '</div>';
        html += '<div><span class="text-gray-500">가입일:</span> ' + formatDate(data.user.createdAt) + '</div>';
        html += '<div><span class="text-gray-500">마지막 접속:</span> ' + (data.user.lastLoginAt ? formatDate(data.user.lastLoginAt) : '-') + '</div>';
        html += '</div></div>';
        
        // 주행 통계
        html += '<div class="bg-blue-50 rounded-lg p-4">';
        html += '<h4 class="font-semibold mb-3">주행 통계</h4>';
        html += '<div class="grid grid-cols-3 gap-4 text-sm text-center">';
        html += '<div><div class="text-2xl font-bold text-blue-600">' + (data.ridingStats.totalRides || 0) + '</div><div class="text-gray-500">총 주행 횟수</div></div>';
        html += '<div><div class="text-2xl font-bold text-blue-600">' + (data.ridingStats.totalDistance || 0).toFixed(1) + ' km</div><div class="text-gray-500">총 주행 거리</div></div>';
        html += '<div><div class="text-2xl font-bold text-blue-600">' + Math.round((data.ridingStats.totalDuration || 0) / 60) + ' 분</div><div class="text-gray-500">총 주행 시간</div></div>';
        html += '</div></div>';
        
        // 기체 목록
        html += '<div class="bg-green-50 rounded-lg p-4">';
        html += '<h4 class="font-semibold mb-3">등록된 기체 (' + (data.scooters ? data.scooters.length : 0) + '대)</h4>';
        if (data.scooters && data.scooters.length > 0) {
          html += '<div class="space-y-2">';
          data.scooters.forEach(function(s) {
            html += '<div class="bg-white rounded p-2 text-sm flex justify-between items-center">';
            html += '<span class="font-medium">' + (s.name || '미등록') + '</span>';
            html += '<span class="text-gray-500">' + (s.manufacturer || '') + ' ' + (s.model || '') + '</span>';
            html += '</div>';
          });
          html += '</div>';
        } else {
          html += '<div class="text-gray-500 text-sm">등록된 기체가 없습니다.</div>';
        }
        html += '</div>';
        
        // 게시글 목록
        html += '<div class="bg-yellow-50 rounded-lg p-4">';
        html += '<h4 class="font-semibold mb-3">게시글 (' + (data.posts ? data.posts.length : 0) + '개)</h4>';
        if (data.posts && data.posts.length > 0) {
          html += '<div class="space-y-2 max-h-40 overflow-y-auto">';
          data.posts.forEach(function(p) {
            html += '<div class="bg-white rounded p-2 text-sm">';
            html += '<div class="font-medium truncate">' + (p.content ? p.content.substring(0, 50) : '내용 없음') + '</div>';
            html += '<div class="text-xs text-gray-500">' + formatDate(p.createdAt) + ' | 좋아요 ' + (p.likeCount || 0) + ' | 댓글 ' + (p.commentCount || 0) + '</div>';
            html += '</div>';
          });
          html += '</div>';
        } else {
          html += '<div class="text-gray-500 text-sm">작성한 게시글이 없습니다.</div>';
        }
        html += '</div>';
        
        // 친구 목록
        html += '<div class="bg-purple-50 rounded-lg p-4">';
        html += '<h4 class="font-semibold mb-3">친구 (' + (data.friends ? data.friends.length : 0) + '명)</h4>';
        if (data.friends && data.friends.length > 0) {
          html += '<div class="flex flex-wrap gap-2">';
          data.friends.forEach(function(f) {
            html += '<span class="bg-white px-2 py-1 rounded text-sm">' + (f.name || f.email || 'ID:'+f.id) + '</span>';
          });
          html += '</div>';
        } else {
          html += '<div class="text-gray-500 text-sm">친구가 없습니다.</div>';
        }
        html += '</div>';
        
        document.getElementById('userProfileContent').innerHTML = html;
      } catch (e) {
        document.getElementById('userProfileContent').innerHTML = '<div class="text-center text-red-500">사용자 정보를 불러오는데 실패했습니다.</div>';
      }
    }

    function closeUserProfileModal() {
      document.getElementById('userProfileModal').classList.remove('active');
    }
  <\/script>
</body>
</html>`;
}

export default router;
