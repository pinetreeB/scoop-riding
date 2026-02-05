import mysql from "mysql2/promise";
import * as fs from "fs";

async function exportData() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);

  console.log("Exporting data from Manus database...");

  // Get all table names
  const [tables] = await connection.query("SHOW TABLES");
  const tableNames = (tables as any[]).map((row: any) => Object.values(row)[0] as string);
  
  console.log(`Found ${tableNames.length} tables`);

  const exportData: Record<string, any[]> = {};

  for (const tableName of tableNames) {
    try {
      const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
      exportData[tableName] = rows as any[];
      console.log(`Exported ${tableName}: ${(rows as any[]).length} rows`);
    } catch (error) {
      console.error(`Error exporting ${tableName}:`, error);
      exportData[tableName] = [];
    }
  }

  // Save to JSON file
  fs.writeFileSync("data-export.json", JSON.stringify(exportData, (key, value) => {
    // Handle Date objects and Buffer
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
      return value.toString("base64");
    }
    return value;
  }, 2));
  
  console.log("Data exported to data-export.json");

  await connection.end();
}

exportData().catch(console.error);
