import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { users } from "../drizzle/schema";
import { eq, or, like } from "drizzle-orm";

async function grantAdminRole() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  // 소나무군, 스쿱 모빌리티 계정 찾기
  const targetUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(
      or(
        like(users.name, "%소나무%"),
        like(users.name, "%스쿱%"),
        like(users.email, "%scoop%"),
        like(users.email, "%pinetree%")
      )
    );

  console.log("Found users:", targetUsers);

  // 관리자 권한 부여
  for (const user of targetUsers) {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
    console.log(`Granted admin role to: ${user.name} (${user.email})`);
  }

  await connection.end();
  console.log("Done!");
}

grantAdminRole().catch(console.error);
