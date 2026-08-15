import { eq } from "drizzle-orm";
import { PUBLIC_API_CACHE_HEADERS } from "../../../src/cache";
import { db } from "../../../src/db";
import { stock, themeStock } from "../../../src/db/schema";
import type { components } from "../../../src/generated/api";

// レスポンスの型は openapi.yaml から生成したものを参照する。
// 契約を変えて実装が追随していなければ typecheck が落ちる（全体設計書 §8）。
type Stock = components["schemas"]["Stock"];

/**
 * 銘柄一覧。認証は要らない（ログイン廃止 設計書 §3.2）。
 * 返すのは運用者が登録した銘柄だけで、誰が何を持っているかは含まない。
 */
export async function GET(): Promise<Response> {
  const rows = await db
    .select({
      id: stock.id,
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
      // 所属テーマは銘柄ごとに1行ずつ左結合で取り、下でまとめる。
      // 銘柄1件につき問い合わせを1本ずつ出すより、1本で読むほうが速い
      themeId: themeStock.themeId,
    })
    .from(stock)
    .leftJoin(themeStock, eq(themeStock.stockId, stock.id))
    .orderBy(stock.market, stock.ticker);

  // 左結合で銘柄が所属テーマの数だけ重複しているのを、銘柄ごとに1件へまとめる。
  // orderBy が市場・ティッカーの順を決めているので、Map の挿入順がそのまま並び順になる
  const stocks = new Map<number, Stock>();
  for (const row of rows) {
    const found = stocks.get(row.id);
    if (found === undefined) {
      stocks.set(row.id, {
        id: row.id,
        market: row.market,
        ticker: row.ticker,
        name: row.name,
        // 所属が無い銘柄は左結合で themeId が NULL になる
        themeIds: row.themeId === null ? [] : [row.themeId],
      });
      continue;
    }
    if (row.themeId !== null) found.themeIds.push(row.themeId);
  }

  return Response.json([...stocks.values()], {
    headers: PUBLIC_API_CACHE_HEADERS,
  });
}
