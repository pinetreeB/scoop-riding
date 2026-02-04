import { describe, it, expect } from "vitest";
import mysql from "mysql2/promise";

describe("GCP Cloud SQL Connection", () => {
  it("should connect to GCP Cloud SQL database with SSL", async () => {
    const dbUrl = process.env.GCP_DATABASE_URL;
    expect(dbUrl).toBeDefined();
    expect(dbUrl).toContain("34.22.109.197");

    // Parse the connection URL manually
    // Format: mysql://user:password@host:port/database
    const match = dbUrl!.match(/mysql:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)/);
    expect(match).not.toBeNull();
    
    const [, user, password, host, port, database] = match!;
    
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      user,
      password,
      database,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Test query
    const [rows] = await connection.execute("SELECT COUNT(*) as count FROM users");
    expect(Array.isArray(rows)).toBe(true);
    expect((rows as any[])[0].count).toBeGreaterThan(0);

    await connection.end();
  }, 30000);

  it("should have all required tables", async () => {
    const dbUrl = process.env.GCP_DATABASE_URL;
    const match = dbUrl!.match(/mysql:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)/);
    const [, user, password, host, port, database] = match!;
    
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      user,
      password,
      database,
      ssl: {
        rejectUnauthorized: false
      }
    });

    const [rows] = await connection.execute(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?",
      [database]
    );
    expect((rows as any[])[0].count).toBe(42);

    await connection.end();
  }, 30000);
});
