import { and, eq, inArray } from "drizzle-orm";
import { db } from ".";
import { event, holding, stock } from "./schema";

/**
 * 開発中の表示確認に使うデータ（Issue #8 設計書 §3）。
 *
 * 日付の出典は各社のIRページだけを使う（全体設計書 §5.1）ため、
 * 入れられるのは銘柄イベント（決算発表日）だけになる。市場イベント・
 * テーマイベントは、使ってよい出典が増えるまで入れられない。
 */
const STOCKS = [
  { market: "JP", ticker: "7203", name: "トヨタ自動車", fiscalMonth: 3 },
  { market: "JP", ticker: "9434", name: "ソフトバンク", fiscalMonth: 3 },
  { market: "JP", ticker: "6367", name: "ダイキン工業", fiscalMonth: 3 },
] as const;

/**
 * 2026年8月4日に決算発表が集中しているため、同じ日に3件を置く。
 * これで「1日3件のセルが2件＋ +1 になる」「★3だけ強調される」を
 * 起動月のページで目視できる。重要度は運用者の主観の設定値なので、
 * 出典で確認する対象ではない（設計書 §3）。
 */
const EVENTS = [
  {
    ticker: "7203",
    title: "トヨタ自動車 2027年3月期 第1四半期決算",
    shortLabel: "7203決算",
    startDate: "2026-08-04",
    importance: 3,
    sourceUrl: "https://global.toyota/jp/ir/financial-results/index.html",
  },
  {
    ticker: "9434",
    title: "ソフトバンク 2027年3月期 第1四半期決算",
    shortLabel: "9434決算",
    startDate: "2026-08-04",
    importance: 2,
    sourceUrl: "https://www.softbank.jp/corp/news/press/sbkk/2026/20260804_01/",
  },
  {
    ticker: "6367",
    title: "ダイキン工業 2027年3月期 第1四半期決算",
    shortLabel: "6367決算",
    startDate: "2026-08-04",
    importance: 1,
    sourceUrl: "https://www.daikin.co.jp/investor/calendar",
  },
] as const;

/**
 * 銘柄・保有・イベントを投入する。何度実行しても増えない。
 * 銘柄と保有は一意の制約があるので衝突を無視し、
 * イベントには一意の制約が無いため、見出しで既にあるかを判定する。
 */
export async function seedEvents(userId: string): Promise<{ created: number }> {
  await db
    .insert(stock)
    .values([...STOCKS])
    .onConflictDoNothing();

  const stocks = await db
    .select({ id: stock.id, ticker: stock.ticker })
    .from(stock)
    .where(
      and(
        eq(stock.market, "JP"),
        inArray(
          stock.ticker,
          STOCKS.map((s) => s.ticker),
        ),
      ),
    );
  const stockIdOf = new Map(stocks.map((s) => [s.ticker, s.id]));

  await db
    .insert(holding)
    .values(stocks.map((s) => ({ userId, stockId: s.id })))
    .onConflictDoNothing();

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

  const missing = EVENTS.filter((e) => !have.has(e.title)).map(
    ({ ticker, ...rest }) => {
      const stockId = stockIdOf.get(ticker);
      // 直前に投入しているので通常は起きない。握りつぶすと
      // 「イベントが入らないのに成功する」状態になるため落とす
      if (stockId === undefined) {
        throw new Error(`銘柄が見つからない: ${ticker}`);
      }
      return { ...rest, stockId };
    },
  );
  if (missing.length > 0) await db.insert(event).values(missing);
  return { created: missing.length };
}
