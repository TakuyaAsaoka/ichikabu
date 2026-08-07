import { defineConfig } from "drizzle-kit";
import { loadEnvLocal } from "./src/env";

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL が設定されていない。.env.example を参照");
}

export default defineConfig({
  // schema.ts が Better Auth の生成分（auth-schema.ts）も再エクスポートしているため、
  // 全テーブルが1本のマイグレーション履歴に載る（設計書 §9）
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
