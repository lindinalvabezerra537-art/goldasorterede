import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// EXTERNAL_DATABASE_URL tem prioridade: banco externo (ex: Neon) que persiste
// independente de qual conta Replit está rodando o projeto.
// Se não estiver configurado, cai no DATABASE_URL gerenciado pelo Replit.
const connectionString = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
