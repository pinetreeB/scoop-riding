import { Router, Request, Response, NextFunction } from "express";
import * as jose from "jose";
import * as path from "path";
import { ENV } from "../_core/env";
import * as db from "../db";
import { eq, desc, asc, like, or, sql, and, gte } from "drizzle-orm";
import { users, ridingRecords } from "../../drizzle/schema";

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

// Middleware to verify admin token
async function verifyAdminToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "인증이 필요합니다." });
  }

  const token = authHeader.substring(7);
  try {
    const { payload } = await jose.jwtVerify(token, ADMIN_JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ error: "관리자 권한이 필요합니다." });
    }
    (req as any).adminEmail = payload.email;
    next();
  } catch (e) {
    return res.status(401).json({ error: "유효하지 않은 토큰입니다." });
  }
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
    
    return res.json({ token, email });
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
  res.json({ email: (req as any).adminEmail });
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
      .select({ count: sql<number>`COUNT(*)` })
      .from(users);
    const totalUsers = totalUsersResult[0]?.count || 0;

    // Today's new users
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUsersResult = await dbInstance
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(gte(users.createdAt, today));
    const todayUsers = todayUsersResult[0]?.count || 0;

    // Total rides
    const totalRidesResult = await dbInstance
      .select({ count: sql<number>`COUNT(*)` })
      .from(ridingRecords);
    const totalRides = totalRidesResult[0]?.count || 0;

    // Total distance
    const totalDistanceResult = await dbInstance
      .select({ total: sql<number>`COALESCE(SUM(distance), 0)` })
      .from(ridingRecords);
    const totalDistance = totalDistanceResult[0]?.total || 0;

    res.json({ totalUsers, todayUsers, totalRides, totalDistance });
  } catch (e) {
    console.error("Admin stats error:", e);
    res.status(500).json({ error: "통계를 불러오는데 실패했습니다." });
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
      .select({ count: sql<number>`COUNT(*)` })
      .from(users);
    
    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }
    
    const countResult = await countQuery;
    const total = countResult[0]?.count || 0;

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

    // Get users with ride count
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
        lastSignedIn: users.lastSignedIn,
        rideCount: sql<number>`(SELECT COUNT(*) FROM ridingRecords WHERE ridingRecords.userId = users.id)`
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
        totalRides: sql<number>`COUNT(*)`,
        totalDistance: sql<number>`COALESCE(SUM(distance), 0)`,
        totalDuration: sql<number>`COALESCE(SUM(duration), 0)`
      })
      .from(ridingRecords)
      .where(eq(ridingRecords.userId, userId));

    const stats = statsResult[0] || { totalRides: 0, totalDistance: 0, totalDuration: 0 };

    res.json({
      ...user,
      passwordHash: undefined, // Don't expose password hash
      stats
    });
  } catch (e) {
    console.error("Admin user detail error:", e);
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

    await dbInstance
      .update(users)
      .set({
        name: name || null,
        email: email || null,
        role: role || "user",
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

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

    // Delete user's riding records first
    await dbInstance
      .delete(ridingRecords)
      .where(eq(ridingRecords.userId, userId));

    // Delete user
    await dbInstance
      .delete(users)
      .where(eq(users.id, userId));

    res.json({ success: true });
  } catch (e) {
    console.error("Admin user delete error:", e);
    res.status(500).json({ error: "사용자 삭제에 실패했습니다." });
  }
});

// Serve admin dashboard HTML
router.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

export default router;
