import { defineConfig } from "vitest/config";
import { loadEnvLocal } from "./src/env.ts";

// Next.js は NODE_ENV=test のとき .env.local を読まない
loadEnvLocal();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL が設定されていない。.env.example を参照");
}
/** 接続先のデータベース名。localhost と 127.0.0.1 のような表記のちがいに左右されずに比べる */
const databaseName = (url: string) => new URL(url).pathname;

// テストは毎回全テーブルを空にするため、開発用と同じ接続先だと開発データを全部消す。
// ホストの書き方が違っても同じデータベースを指しうるので、比べるのはデータベース名にする
const devDatabaseUrl = process.env.DATABASE_URL;
if (
  devDatabaseUrl &&
  databaseName(testDatabaseUrl) === databaseName(devDatabaseUrl)
) {
  throw new Error(
    "TEST_DATABASE_URL が DATABASE_URL と同じデータベースを指している。別のデータベースを指すこと",
  );
}

export default defineConfig({
  test: {
    // 開発用DBを壊さないよう、テストは専用のデータベースに向ける
    env: { DATABASE_URL: testDatabaseUrl },
    globalSetup: ["./test/global-setup.ts"],
    // テストファイルが読み込まれる前に走る前置き。`next/headers` と `ADMIN_EMAIL` を
    // 差し替える。**ここに置くから各テストは素の `import` で書ける**（→ `test/setup.ts`）
    setupFiles: ["./test/setup.ts"],
    // DBを共有するテストが並行して互いのデータを消し合わないよう直列で流す
    fileParallelism: false,
  },
});
