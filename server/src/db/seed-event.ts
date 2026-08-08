import { inArray } from "drizzle-orm";
import { db } from ".";
import { event } from "./schema";

/**
 * 開発中の表示確認に使うイベント（Issue #5 設計書 §3 判断4）。
 * 市場が GLOBAL のイベントは保有銘柄が無くても全員に返るため、
 * 銘柄・テーマを作らずに iOS の一覧表示を確認できる。
 */
const EVENTS: (typeof event.$inferInsert)[] = [
  {
    market: "GLOBAL",
    title: "FOMC 政策金利発表",
    shortLabel: "FOMC",
    startDate: "2026-09-16",
    endDate: "2026-09-17",
    time: "03:00:00",
    importance: 3,
  },
  {
    market: "GLOBAL",
    title: "米消費者物価指数（CPI）",
    shortLabel: "米CPI",
    startDate: "2026-09-11",
    time: "21:30:00",
    importance: 2,
  },
  {
    market: "GLOBAL",
    title: "米雇用統計",
    shortLabel: "米雇用",
    startDate: "2026-10-02",
    time: "21:30:00",
    importance: 3,
    note: "非農業部門雇用者数と失業率",
  },
];

/**
 * イベントを投入する。何度実行しても増えない。
 * イベントには一意の制約が無いため、見出しで既にあるかを判定する。
 */
export async function seedEvents(): Promise<{ created: number }> {
  const existing = await db
    .select({ title: event.title })
    .from(event)
    .where(
      inArray(
        event.title,
        EVENTS.map((e) => e.title),
      ),
    );
  const have = new Set(existing.map((row) => row.title));
  const missing = EVENTS.filter((e) => !have.has(e.title));
  if (missing.length > 0) await db.insert(event).values(missing);
  return { created: missing.length };
}
