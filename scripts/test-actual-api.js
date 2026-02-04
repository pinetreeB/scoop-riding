const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== 실제 getPosts 로직 테스트 (수정 후) ===\n');
  
  const testUserId = 1;
  
  // 1. 기존 N+1 방식 시뮬레이션
  console.log('1. 기존 N+1 방식:');
  const start1 = Date.now();
  
  const [posts] = await conn.execute(`
    SELECT p.id, p.userId, p.title, p.content, p.postType, 
           p.likeCount, p.commentCount, p.viewCount, p.createdAt,
           u.name as authorName
    FROM posts p
    LEFT JOIN users u ON p.userId = u.id
    ORDER BY p.createdAt DESC
    LIMIT 50
  `);
  
  // N+1: 각 게시물별 좋아요 확인
  for (const post of posts) {
    await conn.execute(`
      SELECT * FROM postLikes WHERE postId = ? AND userId = ? LIMIT 1
    `, [post.id, testUserId]);
  }
  const time1 = Date.now() - start1;
  console.log(`   총 시간: ${time1}ms (${posts.length}개 게시물, ${posts.length + 1}번 쿼리)\n`);
  
  // 2. 최적화된 방식 (단일 쿼리)
  console.log('2. 최적화된 방식 (단일 쿼리):');
  const start2 = Date.now();
  
  const [posts2] = await conn.execute(`
    SELECT p.id, p.userId, p.title, p.content, p.postType, 
           p.likeCount, p.commentCount, p.viewCount, p.createdAt,
           u.name as authorName
    FROM posts p
    LEFT JOIN users u ON p.userId = u.id
    ORDER BY p.createdAt DESC
    LIMIT 50
  `);
  
  // 단일 쿼리로 모든 좋아요 확인
  if (posts2.length > 0) {
    const postIds = posts2.map(p => p.id).join(',');
    await conn.execute(`
      SELECT postId FROM postLikes WHERE postId IN (${postIds}) AND userId = ?
    `, [testUserId]);
  }
  const time2 = Date.now() - start2;
  console.log(`   총 시간: ${time2}ms (${posts2.length}개 게시물, 2번 쿼리)\n`);
  
  console.log(`=== 성능 개선 결과 ===`);
  console.log(`기존 방식: ${time1}ms`);
  console.log(`최적화 방식: ${time2}ms`);
  console.log(`개선율: ${Math.round((time1 - time2) / time1 * 100)}% 빠름 (${Math.round(time1 / time2)}배)`);
  
  await conn.end();
}

main().catch(console.error);
