const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // rides.list 쿼리 실제 실행 시간 측정
  console.log('=== rides.list 쿼리 성능 테스트 ===');
  
  // 사용자별 기록 수 확인
  const [userRecords] = await conn.execute(`
    SELECT u.id, u.name, COUNT(r.id) as record_count
    FROM users u
    LEFT JOIN ridingRecords r ON u.id = r.userId
    GROUP BY u.id
    ORDER BY record_count DESC
    LIMIT 10
  `);
  console.log('\n사용자별 기록 수 TOP 10:');
  userRecords.forEach(u => {
    console.log(`${u.name} (ID: ${u.id}): ${u.record_count}개`);
  });
  
  // 가장 많은 기록을 가진 사용자로 쿼리 테스트
  if (userRecords.length > 0) {
    const testUserId = userRecords[0].id;
    console.log(`\n사용자 ID ${testUserId}로 쿼리 테스트:`);
    
    // 1. GPS 데이터 포함 쿼리 (느림)
    const start1 = Date.now();
    const [withGps] = await conn.execute(`
      SELECT * FROM ridingRecords WHERE userId = ? ORDER BY createdAt DESC LIMIT 50
    `, [testUserId]);
    const time1 = Date.now() - start1;
    console.log(`GPS 포함 전체 조회: ${time1}ms, 결과 ${withGps.length}개`);
    
    // 2. GPS 데이터 제외 쿼리 (빠름)
    const start2 = Date.now();
    const [withoutGps] = await conn.execute(`
      SELECT id, userId, recordId, date, duration, distance, avgSpeed, maxSpeed, 
             startTime, endTime, scooterId, voltageStart, voltageEnd, socStart, socEnd,
             temperature, humidity, windSpeed, windDirection, precipitationType, 
             weatherCondition, energyWh, createdAt
      FROM ridingRecords WHERE userId = ? ORDER BY createdAt DESC LIMIT 50
    `, [testUserId]);
    const time2 = Date.now() - start2;
    console.log(`GPS 제외 조회: ${time2}ms, 결과 ${withoutGps.length}개`);
    
    // 3. 전체 사용자 랭킹 쿼리 테스트
    const start3 = Date.now();
    const [ranking] = await conn.execute(`
      SELECT 
        u.id, u.name, u.profileImageUrl, u.profileColor,
        COUNT(r.id) as totalRides,
        COALESCE(SUM(r.distance), 0) as totalDistance,
        COALESCE(SUM(r.duration), 0) as totalDuration
      FROM users u
      LEFT JOIN ridingRecords r ON u.id = r.userId
      GROUP BY u.id
      ORDER BY totalDistance DESC
      LIMIT 100
    `);
    const time3 = Date.now() - start3;
    console.log(`랭킹 쿼리: ${time3}ms, 결과 ${ranking.length}개`);
    
    // 4. 주간 랭킹 쿼리 테스트
    const start4 = Date.now();
    const [weeklyRanking] = await conn.execute(`
      SELECT 
        u.id, u.name, u.profileImageUrl, u.profileColor,
        COUNT(r.id) as totalRides,
        COALESCE(SUM(r.distance), 0) as totalDistance,
        COALESCE(SUM(r.duration), 0) as totalDuration
      FROM users u
      LEFT JOIN ridingRecords r ON u.id = r.userId 
        AND r.createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY u.id
      HAVING totalDistance > 0
      ORDER BY totalDistance DESC
      LIMIT 100
    `);
    const time4 = Date.now() - start4;
    console.log(`주간 랭킹 쿼리: ${time4}ms, 결과 ${weeklyRanking.length}개`);
  }
  
  // 느린 쿼리 원인 분석
  console.log('\n=== 잠재적 성능 문제 ===');
  
  // gpsPointsJson 컬럼이 SELECT * 에 포함되면 대용량 데이터 전송
  const [avgGpsSize] = await conn.execute(`
    SELECT 
      ROUND(AVG(LENGTH(gpsPointsJson)) / 1024, 2) as avg_kb,
      ROUND(SUM(LENGTH(gpsPointsJson)) / 1024 / 1024, 2) as total_mb
    FROM ridingRecords
    WHERE gpsPointsJson IS NOT NULL
  `);
  console.log(`1. gpsPointsJson 평균 크기: ${avgGpsSize[0].avg_kb}KB (총 ${avgGpsSize[0].total_mb}MB)`);
  console.log('   → rides.list에서 SELECT * 사용 시 불필요한 대용량 데이터 전송');
  
  // 인덱스 상태 확인
  const [indexStats] = await conn.execute(`
    SELECT 
      index_name,
      cardinality
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ridingRecords'
  `);
  console.log('\n2. ridingRecords 인덱스 카디널리티:');
  indexStats.forEach(idx => {
    console.log(`   ${idx.index_name}: ${idx.cardinality}`);
  });
  
  await conn.end();
}

main().catch(console.error);
