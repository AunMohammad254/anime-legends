import { readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the PostgreSQL database used by the game.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  try {
    const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
    await pool.query(schema);
    console.log("The game progress table is ready.");
  } catch {
    console.error("Database setup failed. Check the connection and permissions to create the progress table.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
