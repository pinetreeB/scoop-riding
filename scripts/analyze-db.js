const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 테이블별 크기 확인
  console.log('=== 테이블별 크기 ===');
  const [tables] = await conn.execute(`
    SELECT 
      table_name,
      ROUND(data_length / 1024 / 1024, 2) as data_mb,
      ROUND(index_length / 1024 / 1024, 2) as index_mb,
      table_rows
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
    ORDER BY data_length DESC
  `);
  tables.forEach(t => {
    console.log(`${t.table_name}: 데이터 ${t.data_mb}MB, 인덱스 ${t.index_mb}MB, 행 수 ${t.table_rows}`);
  });
  
  // ridingRecords 테이블 인덱스 확인
  console.log('\n=== ridingRecords 인덱스 ===');
  const [indexes] = await conn.execute('SHOW INDEX FROM ridingRecords');
  indexes.forEach(idx => {
    console.log(`${idx.Key_name}: ${idx.Column_name} (Cardinality: ${idx.Cardinality})`);
  });
  
  // gpsPointsJson 컬럼 크기 확인
  console.log('\n=== gpsPointsJson 컬럼 크기 분석 ===');
  const [gpsSize] = await conn.execute(`
    SELECT 
      COUNT(*) as total_records,
      SUM(CASE WHEN gpsPointsJson IS NOT NULL THEN 1 ELSE 0 END) as with_gps,
      ROUND(AVG(LENGTH(gpsPointsJson)) / 1024, 2) as avg_gps_kb,
      ROUND(MAX(LENGTH(gpsPointsJson)) / 1024 / 1024, 2) as max_gps_mb,
      ROUND(SUM(LENGTH(gpsPointsJson)) / 1024 / 1024, 2) as total_gps_mb
    FROM ridingRecords
  `);
  console.log('총 기록:', gpsSize[0].total_records);
  console.log('GPS 데이터 있는 기록:', gpsSize[0].with_gps);
  console.log('평균 GPS 크기:', gpsSize[0].avg_gps_kb, 'KB');
  console.log('최대 GPS 크기:', gpsSize[0].max_gps_mb, 'MB');
  console.log('총 GPS 데이터 크기:', gpsSize[0].total_gps_mb, 'MB');
  
  // 가장 큰 GPS 데이터를 가진 기록 확인
  console.log('\n=== 가장 큰 GPS 데이터 기록 TOP 10 ===');
  const [largeGps] = await conn.execute(`
    SELECT 
      r.id,
      r.recordId,
      u.name as userName,
      r.date,
      r.distance,
      r.duration,
      ROUND(LENGTH(r.gpsPointsJson) / 1024 / 1024, 2) as gps_mb
    FROM ridingRecords r
    LEFT JOIN users u ON r.userId = u.id
    WHERE r.gpsPointsJson IS NOT NULL
    ORDER BY LENGTH(r.gpsPointsJson) DESC
    LIMIT 10
  `);
  largeGps.forEach(r => {
    console.log(`ID ${r.id} (${r.userName}): ${r.gps_mb}MB, 거리 ${r.distance}m, 시간 ${r.duration}s`);
  });
  
  // 최근 쿼리 성능 확인 (slow query)
  console.log('\n=== rides.list 쿼리 시뮬레이션 (EXPLAIN) ===');
  const [explain] = await conn.execute(`
    EXPLAIN SELECT * FROM ridingRecords WHERE userId = 1 ORDER BY createdAt DESC LIMIT 50
  `);
  explain.forEach(e => {
    console.log(`type: ${e.type}, rows: ${e.rows}, Extra: ${e.Extra}`);
  });
  
  await conn.end();
}

main().catch(console.error);
