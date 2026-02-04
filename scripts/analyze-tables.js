const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== ANALYZE TABLE 실행 ===');
  
  // 주요 테이블 목록
  const tables = [
    'ridingRecords',
    'posts',
    'postLikes',
    'users',
    'notifications',
    'announcements',
    'scooters',
    'comments',
    'friends',
    'friendRequests'
  ];
  
  for (const table of tables) {
    try {
      const [result] = await conn.query(`ANALYZE TABLE ${table}`);
      console.log(`${table}: ${JSON.stringify(result)}`);
    } catch (err) {
      console.log(`${table}: 오류 - ${err.message}`);
    }
  }
  
  console.log('\n=== 인덱스 카디널리티 확인 ===');
  const [indexes] = await conn.execute(`
    SELECT table_name, index_name, cardinality
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
    AND table_name IN ('ridingRecords', 'posts', 'postLikes', 'notifications')
    AND seq_in_index = 1
    ORDER BY table_name, index_name
  `);
  
  indexes.forEach(idx => {
    console.log(`${idx.table_name}.${idx.index_name}: ${idx.cardinality}`);
  });
  
  // 성능 테스트
  console.log('\n=== 성능 테스트 (ANALYZE 후) ===');
  
  const start1 = Date.now();
  await conn.execute(`SELECT * FROM posts ORDER BY createdAt DESC LIMIT 50`);
  console.log(`posts 조회: ${Date.now() - start1}ms`);
  
  const start2 = Date.now();
  await conn.execute(`SELECT * FROM ridingRecords WHERE userId = 1 LIMIT 50`);
  console.log(`ridingRecords 조회: ${Date.now() - start2}ms`);
  
  const start3 = Date.now();
  await conn.execute(`SELECT * FROM notifications WHERE userId = 1 ORDER BY createdAt DESC LIMIT 50`);
  console.log(`notifications 조회: ${Date.now() - start3}ms`);
  
  await conn.end();
}

main().catch(console.error);
