import { sql } from "drizzle-orm";
import { expect } from "vitest";
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

/**
 * 公開API（`/api/events`・`/api/stocks`）がCDNに載せるヘッダを確かめる
 * （公開APIのキャッシュ 設計書 §2）。
 *
 * 値は `PUBLIC_API_CACHE_HEADERS` を読まずに直に書く。読んで突き合わせると、
 * 定数を書き換えたときにこの検査も一緒に動いて緑のまま通り、何も守らなくなる
 */
export function expectPublicApiCacheHeaders(response: Response): void {
  expect(Object.fromEntries(response.headers)).toMatchObject({
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control":
      "public, durable, s-maxage=300, stale-while-revalidate=600",
  });
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
