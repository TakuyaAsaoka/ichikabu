import { defineConfig } from "vitest/config";

// Next.js は NODE_ENV=test のとき .env.local を読まないため自前で読む
process.loadEnvFile(".env.local");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL が設定されていない。.env.example を .env.local にコピーすること",
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
