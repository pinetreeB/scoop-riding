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
  // In production, __dirname points to dist folder, so we need to handle both cases
  const fs = require("fs");
  const possiblePaths = [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "..", "admin", "index.html"),
    path.join(process.cwd(), "server", "admin", "index.html")
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  // Fallback: send inline HTML
  res.send(getAdminDashboardHTML());
});

// Inline HTML fallback for production
function getAdminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SCOOP Riding - 관리자 대시보드</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .modal { display: none; }
    .modal.active { display: flex; }
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
        <div class="bg-white rounded-xl p-6 shadow"><div class="text-gray-500 text-sm">전체 사용자</div><div id="statTotalUsers" class="text-3xl font-bold text-gray-800">-</div></div>
        <div class="bg-white rounded-xl p-6 shadow"><div class="text-gray-500 text-sm">오늘 가입</div><div id="statTodayUsers" class="text-3xl font-bold text-green-600">-</div></div>
        <div class="bg-white rounded-xl p-6 shadow"><div class="text-gray-500 text-sm">총 주행 기록</div><div id="statTotalRides" class="text-3xl font-bold text-blue-600">-</div></div>
        <div class="bg-white rounded-xl p-6 shadow"><div class="text-gray-500 text-sm">총 주행 거리</div><div id="statTotalDistance" class="text-3xl font-bold text-orange-500">-</div></div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow mb-6">
        <div class="flex flex-wrap gap-4 items-center">
          <input type="text" id="searchInput" placeholder="이름 또는 이메일로 검색..." class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg" onkeyup="debounceSearch()">
          <select id="filterRole" onchange="loadUsers()" class="px-4 py-2 border border-gray-300 rounded-lg"><option value="">전체 역할</option><option value="user">일반 사용자</option><option value="admin">관리자</option></select>
          <button onclick="loadUsers()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg">새로고침</button>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow overflow-hidden">
        <table class="w-full"><thead class="bg-gray-50"><tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">가입일</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
        </tr></thead><tbody id="usersTableBody" class="divide-y divide-gray-200"><tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr></tbody></table>
      </div>
    </div>
  </div>
  <div id="editModal" class="modal fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-50">
    <div class="bg-white rounded-xl p-6 w-full max-w-md mx-4">
      <h3 class="text-xl font-bold mb-4">사용자 정보 수정</h3>
      <form onsubmit="saveUser(event)"><input type="hidden" id="editUserId">
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">이름</label><input type="text" id="editName" class="w-full px-4 py-2 border border-gray-300 rounded-lg"></div>
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">이메일</label><input type="email" id="editEmail" class="w-full px-4 py-2 border border-gray-300 rounded-lg"></div>
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">역할</label><select id="editRole" class="w-full px-4 py-2 border border-gray-300 rounded-lg"><option value="user">일반 사용자</option><option value="admin">관리자</option></select></div>
        <div class="flex gap-3 mt-6"><button type="button" onclick="closeModal()" class="flex-1 px-4 py-2 bg-gray-200 rounded-lg">취소</button><button type="submit" class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg">저장</button></div>
      </form>
    </div>
  </div>
  <script>
    const API_BASE = window.location.origin;
    let currentPage = 1, totalPages = 1, searchTimeout = null;
    let adminToken = localStorage.getItem('adminToken');
    document.addEventListener('DOMContentLoaded', () => { if (adminToken) checkAuth(); });
    async function checkAuth() {
      try {
        const res = await fetch(API_BASE+'/api/admin/me', { headers: { 'Authorization': 'Bearer '+adminToken } });
        if (res.ok) { const data = await res.json(); document.getElementById('adminEmail').textContent = data.email; showDashboard(); loadStats(); loadUsers(); }
        else logout();
      } catch (e) { logout(); }
    }
    async function login(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value, password = document.getElementById('loginPassword').value;
      try {
        const res = await fetch(API_BASE+'/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const data = await res.json();
        if (res.ok && data.token) { adminToken = data.token; localStorage.setItem('adminToken', adminToken); document.getElementById('adminEmail').textContent = email; showDashboard(); loadStats(); loadUsers(); }
        else { document.getElementById('loginError').textContent = data.error || '로그인 실패'; document.getElementById('loginError').classList.remove('hidden'); }
      } catch (e) { document.getElementById('loginError').textContent = '서버 연결 실패'; document.getElementById('loginError').classList.remove('hidden'); }
    }
    function logout() { adminToken = null; localStorage.removeItem('adminToken'); document.getElementById('loginSection').classList.remove('hidden'); document.getElementById('dashboardSection').classList.add('hidden'); }
    function showDashboard() { document.getElementById('loginSection').classList.add('hidden'); document.getElementById('dashboardSection').classList.remove('hidden'); }
    async function loadStats() {
      try {
        const res = await fetch(API_BASE+'/api/admin/stats', { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        document.getElementById('statTotalUsers').textContent = data.totalUsers?.toLocaleString() || '0';
        document.getElementById('statTodayUsers').textContent = data.todayUsers?.toLocaleString() || '0';
        document.getElementById('statTotalRides').textContent = data.totalRides?.toLocaleString() || '0';
        document.getElementById('statTotalDistance').textContent = (data.totalDistance ? (data.totalDistance / 1000).toFixed(1) + ' km' : '0 km');
      } catch (e) { console.error(e); }
    }
    function debounceSearch() { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { currentPage = 1; loadUsers(); }, 300); }
    async function loadUsers() {
      const search = document.getElementById('searchInput').value, role = document.getElementById('filterRole').value;
      try {
        const params = new URLSearchParams({ page: currentPage, limit: 20, ...(search && { search }), ...(role && { role }) });
        const res = await fetch(API_BASE+'/api/admin/users?'+params, { headers: { 'Authorization': 'Bearer '+adminToken } });
        const data = await res.json();
        totalPages = data.totalPages || 1;
        renderUsers(data.users || []);
      } catch (e) { console.error(e); }
    }
    function renderUsers(users) {
      const tbody = document.getElementById('usersTableBody');
      if (users.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">사용자가 없습니다.</td></tr>'; return; }
      tbody.innerHTML = users.map(u => '<tr class="hover:bg-gray-50"><td class="px-4 py-3 text-sm">'+u.id+'</td><td class="px-4 py-3 text-sm font-medium">'+(u.name||'-')+'</td><td class="px-4 py-3 text-sm text-gray-600">'+(u.email||'-')+'</td><td class="px-4 py-3 text-sm"><span class="px-2 py-1 rounded-full text-xs '+(u.role==="admin"?'bg-red-100 text-red-800':'bg-green-100 text-green-800')+'">'+u.role+'</span></td><td class="px-4 py-3 text-sm text-gray-600">'+formatDate(u.createdAt)+'</td><td class="px-4 py-3 text-sm"><button onclick="editUser('+u.id+')" class="text-orange-600 hover:text-orange-800 mr-2">수정</button><button onclick="deleteUser('+u.id+')" class="text-red-600 hover:text-red-800">삭제</button></td></tr>').join('');
    }
    async function editUser(userId) {
      try {
        const res = await fetch(API_BASE+'/api/admin/users/'+userId, { headers: { 'Authorization': 'Bearer '+adminToken } });
        const user = await res.json();
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editName').value = user.name || '';
        document.getElementById('editEmail').value = user.email || '';
        document.getElementById('editRole').value = user.role || 'user';
        document.getElementById('editModal').classList.add('active');
      } catch (e) { alert('사용자 정보를 불러오는데 실패했습니다.'); }
    }
    function closeModal() { document.getElementById('editModal').classList.remove('active'); }
    async function saveUser(e) {
      e.preventDefault();
      const userId = document.getElementById('editUserId').value;
      const data = { name: document.getElementById('editName').value, email: document.getElementById('editEmail').value, role: document.getElementById('editRole').value };
      try {
        const res = await fetch(API_BASE+'/api/admin/users/'+userId, { method: 'PUT', headers: { 'Authorization': 'Bearer '+adminToken, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) { closeModal(); loadUsers(); alert('사용자 정보가 수정되었습니다.'); }
        else { const err = await res.json(); alert(err.error || '수정 실패'); }
      } catch (e) { alert('서버 오류'); }
    }
    async function deleteUser(userId) {
      if (!confirm('정말로 이 사용자를 삭제하시겠습니까?')) return;
      try {
        const res = await fetch(API_BASE+'/api/admin/users/'+userId, { method: 'DELETE', headers: { 'Authorization': 'Bearer '+adminToken } });
        if (res.ok) { loadUsers(); loadStats(); alert('사용자가 삭제되었습니다.'); }
        else { const err = await res.json(); alert(err.error || '삭제 실패'); }
      } catch (e) { alert('서버 오류'); }
    }
    function formatDate(d) { if (!d) return '-'; return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
  </script>
</body>
</html>`;
}

export default router;
