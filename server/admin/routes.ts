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
        <button onclick="switchTab('users')" class="tab-btn active px-4 py-2 rounded-lg font-medium" data-tab="users">사용자 관리</button>
        <button onclick="switchTab('announcements')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="announcements">공지사항</button>
        <button onclick="switchTab('surveys')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="surveys">설문 응답</button>
        <button onclick="switchTab('bugs')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="bugs">버그 리포트</button>
        <button onclick="switchTab('posts')" class="tab-btn px-4 py-2 rounded-lg font-medium" data-tab="posts">게시글 관리</button>
      </div>

      <div id="tab-users" class="tab-content active">
        <div class="bg-white rounded-xl p-4 shadow mb-4">
          <div class="flex flex-wrap gap-4 items-center">
            <input type="text" id="searchInput" placeholder="이름 또는 이메일로 검색..." class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg" onkeyup="debounceSearch()">
            <select id="filterRole" onchange="loadUsers()" class="px-4 py-2 border border-gray-300 rounded-lg">
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
    let searchTimeout;

    if (adminToken) { checkAuth(); } else { showLogin(); }

    async function checkAuth() {
      try {
        const res = await fetch(API_BASE+'/api/admin/stats', { headers: { 'Authorization': 'Bearer '+adminToken } });
        if (res.ok) { showDashboard(); loadAllData(); }
        else { showLogin(); }
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
        document.getElementById('adminEmail').textContent = payload.email || '';
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
          localStorage.setItem('adminToken', adminToken);
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
      adminToken = null;
      showLogin();
    }

    function loadAllData() { loadStats(); loadUsers(); loadAnnouncements(); loadSurveys(); loadBugs(); loadPosts(); }

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="'+tab+'"]').classList.add('active');
      document.getElementById('tab-'+tab).classList.add('active');
    }

    async function loadStats() {
      try {
        const res = await fetch(API_BASE+'/api/admin/stats', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        document.getElementById('statTotalUsers').textContent = data.totalUsers || '0';
        document.getElementById('statTodayUsers').textContent = data.todayUsers || '0';
        document.getElementById('statTotalRides').textContent = data.totalRides || '0';
        document.getElementById('statTotalDistance').textContent = (data.totalDistance || 0).toLocaleString() + ' km';
      } catch (e) { console.error(e); }
    }

    function debounceSearch() { clearTimeout(searchTimeout); searchTimeout = setTimeout(loadUsers, 300); }

    async function loadUsers() {
      const search = document.getElementById('searchInput').value;
      const role = document.getElementById('filterRole').value;
      try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (role) params.append('role', role);
        const res = await fetch(API_BASE+'/api/admin/users?'+params.toString(), { headers: { 'Authorization': 'Bearer '+adminToken } });
        const users = await res.json();
        renderUsers(users);
      } catch (e) { console.error(e); }
    }

    function renderUsers(users) {
      const tbody = document.getElementById('usersTableBody');
      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">사용자가 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = users.map(u => \`
        <tr class="hover:bg-gray-50">
          <td class="px-4 py-3 text-sm">\${u.id}</td>
          <td class="px-4 py-3 text-sm font-medium">\${u.name || '-'}</td>
          <td class="px-4 py-3 text-sm">\${u.email}</td>
          <td class="px-4 py-3 text-sm"><span class="px-2 py-1 rounded text-xs \${u.role==='admin'?'bg-orange-100 text-orange-800':'bg-gray-100 text-gray-800'}">\${u.role==='admin'?'관리자':'사용자'}</span></td>
          <td class="px-4 py-3 text-sm text-gray-600">\${formatDate(u.createdAt)}</td>
          <td class="px-4 py-3 text-sm">
            <button onclick="editUser(\${u.id})" class="text-blue-600 hover:text-blue-800 mr-2">수정</button>
            <button onclick="deleteUser(\${u.id})" class="text-red-600 hover:text-red-800">삭제</button>
          </td>
        </tr>
      \`).join('');
    }

    async function editUser(id) {
      try {
        const res = await fetch(API_BASE+'/api/admin/users?search='+id, { headers: { 'Authorization': 'Bearer '+adminToken } });
        const users = await res.json();
        const user = users.find(u => u.id === id);
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
        return '<div class="flex gap-2 mt-2">' + urls.map(url => '<img src="'+url+'" class="w-20 h-20 object-cover rounded cursor-pointer" onclick="window.open(\''+url+'\')">' ).join('') + '</div>';
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
  <\/script>
</body>
</html>`;
}

export default router;
