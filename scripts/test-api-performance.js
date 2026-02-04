const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== API 성능 테스트 ===\n');
  
  // 1. getPosts 테스트 (N+1 문제)
  console.log('1. getPosts 쿼리 테스트 (N+1 문제 확인)');
  const start1 = Date.now();
  
  // 게시물 목록 조회
  const [posts] = await conn.execute(`
    SELECT p.id, p.userId, p.title, p.content, p.postType, 
           p.likeCount, p.commentCount, p.viewCount, p.createdAt,
           u.name as authorName
    FROM posts p
    LEFT JOIN users u ON p.userId = u.id
    ORDER BY p.createdAt DESC
    LIMIT 50
  `);
  const time1a = Date.now() - start1;
  console.log(`   - 게시물 목록 조회: ${time1a}ms (${posts.length}개)`);
  
  // 각 게시물별 좋아요 확인 (N+1 문제 시뮬레이션)
  const start1b = Date.now();
  const testUserId = 1;
  for (const post of posts) {
    await conn.execute(`
      SELECT * FROM postLikes WHERE postId = ? AND userId = ? LIMIT 1
    `, [post.id, testUserId]);
  }
  const time1b = Date.now() - start1b;
  console.log(`   - 좋아요 확인 (N+1): ${time1b}ms (${posts.length}번 쿼리)`);
  console.log(`   - 총 시간: ${time1a + time1b}ms\n`);
  
  // 2. 최적화된 getPosts (JOIN 사용)
  console.log('2. 최적화된 getPosts (서브쿼리 사용)');
  const start2 = Date.now();
  const [optimizedPosts] = await conn.execute(`
    SELECT p.id, p.userId, p.title, p.content, p.postType, 
           p.likeCount, p.commentCount, p.viewCount, p.createdAt,
           u.name as authorName,
           CASE WHEN pl.id IS NOT NULL THEN 1 ELSE 0 END as isLiked
    FROM posts p
    LEFT JOIN users u ON p.userId = u.id
    LEFT JOIN postLikes pl ON p.id = pl.postId AND pl.userId = ?
    ORDER BY p.createdAt DESC
    LIMIT 50
  `, [testUserId]);
  const time2 = Date.now() - start2;
  console.log(`   - 최적화된 조회: ${time2}ms (${optimizedPosts.length}개)`);
  console.log(`   - 성능 개선: ${Math.round((time1a + time1b) / time2)}배 빠름\n`);
  
  // 3. getRanking 테스트
  console.log('3. getRanking 쿼리 테스트');
  const weekStart = new Date();
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  
  const start3 = Date.now();
  const [ranking] = await conn.execute(`
    SELECT 
      u.id, u.name, u.email,
      COUNT(r.id) as totalRides,
      COALESCE(SUM(r.distance), 0) as totalDistance
    FROM users u
    LEFT JOIN ridingRecords r ON u.id = r.userId AND r.createdAt >= ?
    GROUP BY u.id
    HAVING totalDistance > 0
    ORDER BY totalDistance DESC
    LIMIT 50
  `, [weekStart]);
  const time3 = Date.now() - start3;
  console.log(`   - 랭킹 조회: ${time3}ms (${ranking.length}명)\n`);
  
  // 4. 공지사항 테스트
  console.log('4. 공지사항 쿼리 테스트');
  const start4 = Date.now();
  const [announcements] = await conn.execute(`
    SELECT * FROM announcements 
    WHERE isActive = 1 
    ORDER BY priority DESC, createdAt DESC
  `);
  const time4 = Date.now() - start4;
  console.log(`   - 공지사항 조회: ${time4}ms (${announcements.length}개)\n`);
  
  // 5. 알림 테스트
  console.log('5. 알림 쿼리 테스트');
  const start5 = Date.now();
  const [notifications] = await conn.execute(`
    SELECT * FROM notifications 
    WHERE userId = ? 
    ORDER BY createdAt DESC 
    LIMIT 50
  `, [testUserId]);
  const time5 = Date.now() - start5;
  console.log(`   - 알림 조회: ${time5}ms (${notifications.length}개)\n`);
  
  // 6. 인덱스 상태 확인
  console.log('6. 인덱스 상태 확인');
  const [indexes] = await conn.execute(`
    SELECT table_name, index_name, column_name, cardinality
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
    AND table_name IN ('posts', 'postLikes', 'ridingRecords', 'notifications', 'announcements')
    ORDER BY table_name, index_name
  `);
  
  const indexMap = {};
  indexes.forEach(idx => {
    const key = `${idx.table_name}.${idx.index_name}`;
    if (!indexMap[key]) {
      indexMap[key] = { columns: [], cardinality: idx.cardinality };
    }
    indexMap[key].columns.push(idx.column_name);
  });
  
  Object.entries(indexMap).forEach(([key, val]) => {
    console.log(`   ${key}: ${val.columns.join(', ')} (cardinality: ${val.cardinality})`);
  });
  
  // 7. 연결 풀 상태 확인
  console.log('\n7. DB 연결 상태');
  const [processlist] = await conn.execute('SHOW PROCESSLIST');
  console.log(`   - 활성 연결 수: ${processlist.length}`);
  
  await conn.end();
  
  console.log('\n=== 분석 결론 ===');
  console.log('주요 성능 병목:');
  console.log('1. getPosts의 N+1 쿼리 문제 - 게시물당 좋아요 확인 쿼리 발생');
  console.log('2. 인덱스 카디널리티 0 - ANALYZE TABLE 필요');
}

main().catch(console.error);
