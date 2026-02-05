import mysql from "mysql2/promise";
import * as fs from "fs";

// GCP Cloud SQL 연결 정보
const GCP_DATABASE_URL = "mysql://scoop_app:N]6tmp,|gIKe+~2X@34.22.109.197:3306/scoop_riding";

async function importData() {
  // 내보낸 데이터 로드
  const exportedData = JSON.parse(fs.readFileSync("data-export.json", "utf-8"));
  
  // GCP Cloud SQL 연결
  const connection = await mysql.createConnection(GCP_DATABASE_URL);
  
  console.log("Connected to GCP Cloud SQL");
  
  // 먼저 기존 Manus DB에서 스키마 가져오기
  const manusConnection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // 테이블 생성 순서 (외래키 의존성 고려)
  const tableOrder = [
    "users",
    "scooters",
    "ridingRecords",
    "posts",
    "comments",
    "postLikes",
    "postViews",
    "friendRequests",
    "friends",
    "follows",
    "notifications",
    "challenges",
    "challengeParticipants",
    "challengeInvitations",
    "badges",
    "userBadges",
    "goals",
    "groupSessions",
    "groupMembers",
    "groupMessages",
    "liveLocations",
    "appVersions",
    "app_versions",
    "announcements",
    "userAnnouncementReads",
    "adminLogs",
    "bugReports",
    "surveyResponses",
    "aiUsage",
    "aiChatHistory",
    "aiChatUsage",
    "batteryAnalysis",
    "batteryAnalysisSummary",
    "batteryHealthReports",
    "batteryRideLogs",
    "chargingRecords",
    "maintenanceItems",
    "maintenanceRecords",
    "postImages",
    "suspiciousUserReports",
    "userActivityLogs",
    "userBans",
    "__drizzle_migrations",
  ];
  
  // 각 테이블의 CREATE TABLE 문 가져오기 및 실행
  for (const tableName of tableOrder) {
    if (!exportedData[tableName]) {
      console.log(`Skipping ${tableName} (not in export)`);
      continue;
    }
    
    try {
      // 테이블 생성 문 가져오기
      const [createResult] = await manusConnection.query(`SHOW CREATE TABLE \`${tableName}\``);
      const createStatement = (createResult as any[])[0]["Create Table"];
      
      // GCP에서 테이블 삭제 (있으면)
      await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      
      // 테이블 생성
      await connection.query(createStatement);
      console.log(`Created table: ${tableName}`);
      
    } catch (error: any) {
      console.error(`Error creating table ${tableName}:`, error.message);
    }
  }
  
  // 외래키 체크 비활성화
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  
  // 데이터 삽입
  for (const tableName of tableOrder) {
    const rows = exportedData[tableName];
    if (!rows || rows.length === 0) {
      console.log(`Skipping ${tableName} (no data)`);
      continue;
    }
    
    try {
      // 각 행 삽입
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row).map(v => {
          if (v === null) return null;
          if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}T/)) {
            // ISO date string to MySQL datetime
            return new Date(v);
          }
          return v;
        });
        
        const placeholders = columns.map(() => "?").join(", ");
        const columnNames = columns.map(c => `\`${c}\``).join(", ");
        
        await connection.query(
          `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders})`,
          values
        );
      }
      console.log(`Imported ${tableName}: ${rows.length} rows`);
    } catch (error: any) {
      console.error(`Error importing ${tableName}:`, error.message);
    }
  }
  
  // 외래키 체크 활성화
  await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  
  console.log("Data import completed!");
  
  await manusConnection.end();
  await connection.end();
}

importData().catch(console.error);
