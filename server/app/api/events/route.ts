import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import { event, holding, stock, themeStock } from "../../../src/db/schema";
import type { components } from "../../../src/generated/api";
import { RIGHTS_YEARS, rightsDates } from "../../../src/rights";

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

/** `note` に出す日付（`2026-03-31` → `3月31日`） */
function monthDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

/**
 * 保有銘柄の決算月から権利付最終日のイベントを作る（権利日設計書 §6）。
 * カレンダーに出すのは権利付最終日の1件だけにし、配当落ち日は `note` に書く。
 * 配当落ち日は権利付最終日の翌営業日なので、独立した情報ではない
 */
function rightsEvents(
  stocks: {
    id: number;
    ticker: string;
    name: string;
    fiscalMonth: number | null;
  }[],
): Event[] {
  return stocks.flatMap(({ id, ticker, name, fiscalMonth }) =>
    RIGHTS_YEARS.flatMap((year) => {
      // 決算月が入っている銘柄だけを問い合わせているが、列がNULL可なので型からは見えない
      if (fiscalMonth === null) return [];
      const dates = rightsDates(year, fiscalMonth);
      // 休場日リストに無い年は計算しない
      if (dates === null) return [];
      return [
        {
          id: `rights-${id}-${year}`,
          kind: "stock" as const,
          title: `${name} 権利付最終日`,
          shortLabel: `${ticker}権利`,
          startDate: dates.lastDate,
          endDate: null,
          time: null,
          // ★3にはしない。毎年かならず来る予定を★3にすると、月サマリの
          //「★3が N件」が毎年その月で膨らみ、荒れるかの答えにならなくなる
          importance: 2,
          note: `権利確定日 ${monthDay(dates.recordDate)} ・ 配当落ち日 ${monthDay(dates.exDate)}`,
          // 休場日リストから計算した日付で、転記元が無い（出典表示設計書 §4）
          source: null,
        },
      ];
    }),
  );
}

/** 文字列の昇順。`localeCompare` と違い、実行環境のロケールに左右されない */
const ascending = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * 契約の並び順（`openapi.yaml`）。startDate → time → id の昇順で、
 * 時刻なしは後ろ。PostgreSQL の `ORDER BY` が昇順でNULLを最後に置くのに合わせる
 */
function compareEvents(a: Event, b: Event): number {
  if (a.startDate !== b.startDate) return ascending(a.startDate, b.startDate);
  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return ascending(a.time, b.time);
  }
  return ascending(a.id, b.id);
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

  // 権利日を計算する銘柄。決算月は CHECK 制約により JP 銘柄にしか入らないので、
  // 非NULLで絞れば市場の条件は要らない（全体設計書 §4.1）
  const rightsStocks = await db
    .select({
      id: stock.id,
      ticker: stock.ticker,
      name: stock.name,
      fiscalMonth: stock.fiscalMonth,
    })
    .from(stock)
    .innerJoin(holding, eq(holding.stockId, stock.id))
    .where(and(eq(holding.userId, userId), isNotNull(stock.fiscalMonth)));

  // 表示対象の判定（イベント取得API設計書 §5）。
  // market が NULL の行（テーマ・銘柄イベント）は IN が真にならないため、
  // 市場の2条件に引っかからない。CHECK 制約の排他がそのまま効く。
  // 並べ替えは計算したイベントと結合したあとに1回だけ行うので、ここではしない
  const rows = await db
    .select()
    .from(event)
    .where(
      and(
        // 非アクティブの行は返さない（公表予定の非アクティブ化 設計書 §1）。
        // 開始日は見ない。非アクティブのまま公表日を過ぎた行（＝中止された回）も
        // 出さないため、書き込み側で開始日を見て active だけで絞れる形にしてある
        eq(event.active, true),
        or(
          eq(event.market, "GLOBAL"),
          inArray(event.market, heldMarkets),
          inArray(event.stockId, heldStocks),
          inArray(event.themeId, heldThemes),
        ),
      ),
    );

  const registered = rows.map(
    (row): Event => ({
      // 計算した権利日は行IDを持てないため、契約の id は文字列（権利日設計書 §5）
      id: String(row.id),
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
      // 出典は名前とURLが揃ったときだけ返す。URLだけの行は運用者向けの記録で、
      // 画面には出さない（出典表示設計書 §3.1）。名前だけの行は CHECK が防いでいる
      source:
        row.sourceName !== null && row.sourceUrl !== null
          ? { name: row.sourceName, url: row.sourceUrl }
          : null,
    }),
  );

  const body = [...registered, ...rightsEvents(rightsStocks)].sort(
    compareEvents,
  );
  return Response.json(body);
}
