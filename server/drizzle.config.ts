import { defineConfig } from "drizzle-kit";

// スキーマ定義・DB接続・マイグレーションは Issue #2 のスコープ。
// ここでは配線のみ行い、参照先のファイルは #2 で作る。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
