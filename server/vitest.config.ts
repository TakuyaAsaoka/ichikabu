import { defineConfig } from "vitest/config";
import { loadEnvLocal } from "./src/env";

// Next.js は NODE_ENV=test のとき .env.local を読まない
loadEnvLocal();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL が設定されていない。.env.example を参照");
}
// テストは毎回全テーブルを空にするため、開発用と同じ接続先だと開発データを全部消す
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL が DATABASE_URL と同じ。別のデータベースを指すこと",
  );
}

export default defineConfig({
  test: {
    // 開発用DBを壊さないよう、テストは専用のデータベースに向ける
    env: { DATABASE_URL: testDatabaseUrl },
    globalSetup: ["./test/global-setup.ts"],
    // DBを共有するテストが並行して互いのデータを消し合わないよう直列で流す
    fileParallelism: false,
  },
});
