import { defineConfig } from "drizzle-kit";

// drizzle-kit は Next.js の外で動くため .env.local を自前で読む
process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL が設定されていない。.env.example を .env.local にコピーすること",
  );
}

export default defineConfig({
  // schema.ts が Better Auth の生成分（auth-schema.ts）も再エクスポートしているため、
  // 全テーブルが1本のマイグレーション履歴に載る（設計書 §9）
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
