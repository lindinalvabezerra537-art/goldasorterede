import { defineConfig } from "drizzle-kit";
import path from "path";

const dbUrl = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL ou EXTERNAL_DATABASE_URL precisam estar configurados");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ssl: process.env.EXTERNAL_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  },
});
