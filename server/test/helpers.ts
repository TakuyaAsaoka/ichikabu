import { sql } from "drizzle-orm";
import { db } from "../src/db";

/** テストごとに全テーブルを空にする。採番も1に戻す */
export async function resetDatabase(): Promise<void> {
  await db.execute(
    sql`TRUNCATE "event", "holding", "theme_stock", "theme", "stock", "account", "session", "verification", "user" RESTART IDENTITY CASCADE`,
  );
}

/** pg のエラーから違反した制約名を取り出す。Drizzle は元のエラーを cause に包む */
function violatedConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    const { constraint } = current as Error & { constraint?: unknown };
    if (typeof constraint === "string") return constraint;
    current = current.cause;
  }
  return undefined;
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
