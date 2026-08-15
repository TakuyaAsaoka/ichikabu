import { and, eq, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import { db } from "./db";
import { event, stock } from "./db/schema";
import { RIGHTS_YEARS } from "./rights";

/**
 * 登録の抜けを見つける（状態画面 設計書 §2）。
 *
 * 判定をここに置き、`app/status/page.tsx` は呼んで並べるだけにする。
 * 5種類それぞれの「抜けあり・抜けなし」を、画面の形に左右されずに確かめられる。
 *
 * **「画面は描画できないから検査できない」と書いてあったのは誤りだった**（Issue #111 で実測）。
 * `@testing-library`・`jsdom`・`happy-dom` はどれも要らず、`react-dom/server` の
 * `renderToStaticMarkup(await Page())` で画面がHTML文字列になる（`react-dom` は
 * package.json の依存に入っている）。画面そのものを確かめる例は
 * `app/audit/page.test.ts`
 */

/**
 * 抜けの種類。並びがそのまま画面の並び順になる。
 * 型ではなく配列で持つ。画面は種類を全部たどるので一覧が要り、
 * 型からは作れない（`Object.keys(GAP_TITLES)` から作ると `as` が要る）
 */
export const GAP_KINDS = [
  "nextEarnings",
  "fiscalMonth",
  "sourceName",
  "pastInactive",
  "closedDays",
] as const;

export type GapKind = (typeof GAP_KINDS)[number];

/** 画面に出す見出し。足し忘れは Record の型が落とす */
export const GAP_TITLES: Record<GapKind, string> = {
  nextEarnings: "次の決算日が未登録",
  fiscalMonth: "決算月なし",
  sourceName: "出典の表示名なし",
  pastInactive: "過ぎた非アクティブ",
  closedDays: "休場日リストの不足",
};

/** 抜け1件 */
export type Gap = {
  kind: GapKind;
  /** 画面に出す1行 */
  label: string;
  /** 直しに行く先。直す画面が無いものは null */
  href: string | null;
};

/**
 * 日本時間の暦日（`YYYY-MM-DD`）。
 * 時間帯を書かずに UTC で切ると、日本時間の朝9時までは前日と判定される
 * （`src/db/dump.ts` の `dumpFileName` と同じ理由）
 */
export const jstToday = (now: Date): string =>
  now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/**
 * 抜けを全部集める。`today` は日本時間の暦日（`YYYY-MM-DD`）。
 *
 * 今日を引数で受け取る。中で時計を読むと、日をまたいだ瞬間に結果が変わる判定を
 * テストから固定できない
 */
export async function findGaps(today: string): Promise<Gap[]> {
  const year = Number(today.slice(0, 4));

  // 銘柄を対象にした、今日以降のイベントが1件も無い銘柄。
  // イベントに種別の列は無いため、対象が自分の銘柄で日付が未来のものを決算とみなす
  // （状態画面 設計書 §2）
  const noNextEarnings = await db
    .select({
      id: stock.id,
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
    })
    .from(stock)
    .where(
      notExists(
        db
          .select({ one: sql`1` })
          .from(event)
          .where(
            and(
              eq(event.stockId, stock.id),
              sql`${event.startDate} >= ${today}`,
            ),
          ),
      ),
    )
    .orderBy(stock.market, stock.ticker);

  // 決算月が無いJP銘柄。権利付最終日が計算されず、カレンダーに出ない
  // （`app/api/events/route.ts` の `rightsEvents`）。
  // US銘柄に決算月は入らない（CHECK 制約 `stock_fiscal_month_market_check`）
  const noFiscalMonth = await db
    .select({ id: stock.id, ticker: stock.ticker, name: stock.name })
    .from(stock)
    .where(and(eq(stock.market, "JP"), isNull(stock.fiscalMonth)))
    .orderBy(stock.ticker);

  // 出典URLはあるが表示名が無い行。出典の記載を条件とする出典では規約の条件を
  // 満たさず、`GET /events` が出典を返さない（出典表示 設計書 §3.1）。
  // 逆（名前だけ）は CHECK 制約 `event_source_name_check` が防いでいる
  const noSourceName = await db
    .select({ id: event.id, startDate: event.startDate, title: event.title })
    .from(event)
    .where(and(isNotNull(event.sourceUrl), isNull(event.sourceName)))
    .orderBy(event.startDate);

  // 非アクティブのまま日付が過ぎた行（＝中止が確定した回）。消してよい行を出す。
  // 非アクティブにするのは開始日が今日以降の行だけなので（公表予定の非アクティブ化
  // 設計書 §3）、過去に落ちた非アクティブは中止が確定したもの。
  // 期間のイベントは終わりの日で見る。始まってから終わるまでの間は過ぎていない
  const pastInactive = await db
    .select({ id: event.id, startDate: event.startDate, title: event.title })
    .from(event)
    .where(
      and(
        eq(event.active, false),
        sql`coalesce(${event.endDate}, ${event.startDate}) < ${today}`,
      ),
    )
    .orderBy(event.startDate);

  return [
    ...noNextEarnings.map((row) => ({
      kind: "nextEarnings" as const,
      label: `${row.market} ${row.ticker} ${row.name}`,
      // 直すのはイベントの登録で、銘柄の編集画面では直せない
      href: null,
    })),
    ...noFiscalMonth.map((row) => ({
      kind: "fiscalMonth" as const,
      label: `JP ${row.ticker} ${row.name}`,
      href: `/stocks/${row.id}`,
    })),
    ...noSourceName.map((row) => ({
      kind: "sourceName" as const,
      label: `${row.startDate} ${row.title}`,
      href: `/events/${row.id}`,
    })),
    ...pastInactive.map((row) => ({
      kind: "pastInactive" as const,
      label: `${row.startDate} ${row.title}`,
      href: `/events/${row.id}`,
    })),
    ...closedDaysGap(year),
  ];
}

/**
 * 休場日リストの不足。翌年ぶんが載っていなければ出す。
 *
 * 足し忘れても権利付最終日が黙って出なくなるだけでエラーにならない
 * （`rightsDates` は載っていない年に `null` を返す）。運用（全体設計書 §14）が
 * 「毎年2月に翌年ぶんを足す」と決めているため、その年のうちに翌年ぶんが要る
 */
function closedDaysGap(year: number): Gap[] {
  const last = RIGHTS_YEARS[RIGHTS_YEARS.length - 1];
  if (last >= year + 1) return [];
  return [
    {
      kind: "closedDays",
      // 足す先はリストの続きの年で、今年の翌年ではない。2年以上ほうっておくと
      // その2つはずれ、今年の翌年を出すと間の年が抜けたまま埋まらない
      label: `休場日リストが${last}年まで。${last + 1}年ぶんから足す（src/rights.ts の CLOSED_DAYS）`,
      // 直すのはソースコードで、画面からは直せない
      href: null,
    },
  ];
}
