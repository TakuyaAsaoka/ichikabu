import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/** テスト用DBに最新のマイグレーションを当てる。制約の検証が本物のスキーマに対して走るようにする */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL が設定されていない");
  }

  const db = drizzle(url);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.$client.end();
}
