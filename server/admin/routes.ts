import { Router, Request, Response, NextFunction } from "express";
import * as jose from "jose";
import * as path from "path";
import * as fs from "fs";
import { ENV } from "../_core/env";
import * as db from "../db";
import { eq, desc, asc, like, or, sql, and, gte } from "drizzle-orm";
import { users, ridingRecords, announcements, posts, surveyResponses, bugReports } from "../../drizzle/schema";

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
      .select({ count: sql`COUNT(*)` })
      .from(users);
    const totalUsers = Number(totalUsersResult[0]?.count) || 0;

    // Today's new users
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUsersResult = await dbInstance
      .select({ count: sql`COUNT(*)` })
      .from(users)
      .where(gte(users.createdAt, today));
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
    const totalDistance = Number(totalDistanceResult[0]?.total) || 0;

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

    const stats = {
      totalRides: Number(statsResult[0]?.totalRides) || 0,
      totalDistance: Number(statsResult[0]?.totalDistance) || 0,
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
    const { status } = req.body;
    
    await dbInstance
      .update(bugReports)
      .set({ status, updatedAt: new Date() })
      .where(eq(bugReports.id, id));
    
    // Send notification to user
    const report = await dbInstance
      .select({ userId: bugReports.userId, title: bugReports.title })
      .from(bugReports)
      .where(eq(bugReports.id, id))
      .limit(1);
    
    if (report.length > 0 && report[0].userId) {
      const statusText = status === "resolved" ? "해결됨" : status === "in_progress" ? "처리 중" : "확인됨";
      await db.createNotification({
        userId: report[0].userId,
        type: "bug_report_update",
        title: "버그 리포트 상태 변경",
        body: `"${report[0].title}" 버그 리포트가 "${statusText}" 상태로 변경되었습니다.`,
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

// Serve admin dashboard HTML
router.get("/", (req: Request, res: Response) => {
  try {
    const htmlPath = path.join(__dirname, "dashboard.html");
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(500).send("Dashboard file not found");
    }
  } catch (e) {
    console.error("Admin dashboard error:", e);
    res.status(500).json({ error: "Failed to load admin dashboard" });
  }
});

export default router;
