import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { violatedConstraint } from "../src/db/violation";

/**
 * テストごとに全テーブルを空にする。採番も1に戻す。
 * 対象はDBに問い合わせて組み立てる。テーブルを足したときの追記漏れは、
 * 何も失敗しないまま無関係なテストを落とすため、手書きの一覧にしない。
 */
export async function resetDatabase(): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I', tablename), ', ')
        INTO tables
        FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename <> '__drizzle_migrations';
      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

/** 制約違反で失敗することを確かめ、違反した制約名を返す */
export async function expectViolation(
  operation: Promise<unknown>,
): Promise<string> {
  try {
    await operation;
  } catch (error) {
    const name = violatedConstraint(error);
    if (name) return name;
    throw error;
  }
  throw new Error("制約違反になるはずの操作が成功した");
}
