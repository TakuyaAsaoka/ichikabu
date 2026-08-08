import { eq, inArray, or } from "drizzle-orm";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import { event, holding, stock, themeStock } from "../../../src/db/schema";
import type { components } from "../../../src/generated/api";

// レスポンスの型は openapi.yaml から生成したものを参照する。
// 契約を変えて実装が追随していなければ typecheck が落ちる（全体設計書 §8）。
type Event = components["schemas"]["Event"];

/**
 * イベントの種別を導く。
 * DBの CHECK 制約で market / themeId / stockId のちょうど1つだけが
 * 非NULLと保証されているため、どの列も埋まっていない場合は考えない。
 * CHECK 制約は型からは見えないので、最後の stock は else 扱いにし、
 * 例外は投げない（イベント取得API設計書 §4）。
 */
function deriveKind(row: {
  market: string | null;
  themeId: number | null;
}): Event["kind"] {
  if (row.market !== null) return "market";
  if (row.themeId !== null) return "theme";
  return "stock";
}

export async function GET(request: Request): Promise<Response> {
  // bearer プラグインの before フックが authorization ヘッダーを
  // セッションクッキーに変換するため、auth.handler を経由しなくても
  // getSession だけで Bearer 認証を判定できる
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    // 401 の本文は使われないので返さない（イベント取得API設計書 §2）
    return new Response(null, { status: 401 });
  }
  const userId = session.user.id;

  // 保有している銘柄
  const heldStocks = db
    .select({ id: holding.stockId })
    .from(holding)
    .where(eq(holding.userId, userId));

  // 保有銘柄の市場
  const heldMarkets = db
    .select({ market: stock.market })
    .from(stock)
    .innerJoin(holding, eq(holding.stockId, stock.id))
    .where(eq(holding.userId, userId));

  // 保有銘柄が所属するテーマ
  const heldThemes = db
    .select({ id: themeStock.themeId })
    .from(themeStock)
    .innerJoin(holding, eq(holding.stockId, themeStock.stockId))
    .where(eq(holding.userId, userId));

  // 表示対象の判定（イベント取得API設計書 §5）。
  // market が NULL の行（テーマ・銘柄イベント）は IN が真にならないため、
  // 市場の2条件に引っかからない。CHECK 制約の排他がそのまま効く
  const rows = await db
    .select()
    .from(event)
    .where(
      or(
        eq(event.market, "GLOBAL"),
        inArray(event.market, heldMarkets),
        inArray(event.stockId, heldStocks),
        inArray(event.themeId, heldThemes),
      ),
    )
    .orderBy(event.startDate, event.time, event.id);

  const body = rows.map(
    (row): Event => ({
      id: row.id,
      kind: deriveKind(row),
      title: row.title,
      shortLabel: row.shortLabel,
      startDate: row.startDate,
      // 値が無いフィールドは null のまま返す（undefined にしない）。
      // 契約は全フィールド required で、無い値は null と決めている
      endDate: row.endDate,
      time: row.time,
      importance: row.importance,
      note: row.note,
    }),
  );
  return Response.json(body);
}
