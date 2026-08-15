import { sql } from "drizzle-orm";
import { db } from "../src/db";
import type { AuditEntry } from "../src/db/audit";
import { pgError } from "../src/db/pg-error";
import type { WriteResult } from "../src/db/write";

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

/**
 * 書き込みが成功したことを判定し、監査ログに残す記録を取り出す。
 * `src/db/write.ts` の書き込みは、失敗すると画面に出すエラー文を返す
 */
export function entriesOf(result: WriteResult): AuditEntry[] {
  if (typeof result === "string") {
    throw new Error(`書き込みが失敗した: ${result}`);
  }
  return result;
}

/** 制約違反で失敗することを確かめ、違反した制約名を返す */
export async function expectViolation(
  operation: Promise<unknown>,
): Promise<string> {
  try {
    await operation;
  } catch (error) {
    const name = pgError(error).constraint;
    if (name) return name;
    throw error;
  }
  throw new Error("制約違反になるはずの操作が成功した");
}
