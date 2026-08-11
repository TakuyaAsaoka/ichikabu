import { and, eq, inArray } from "drizzle-orm";
import { db } from ".";
import { event, holding, stock } from "./schema";

/**
 * 開発中の表示確認に使うデータ（Issue #8 設計書 §3）。
 *
 * 入れられるのは、全体設計書 §5.1 の表で「使う」になっている出典で日付を
 * 確認できるものだけになる。今は各社のIRページ（銘柄イベント）と FRB
 * （FOMC の市場イベント）の2つ。テーマイベントは、テーマ固有の出来事の
 * 出典がまだ無いため入れられない。
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
    sourceUrl:
      "https://global.toyota/pages/global_toyota/ir/financial-results/2027_1q_summary_jp.pdf",
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
    sourceUrl: "https://www.daikin.co.jp/press/2026/20260804",
  },
] as const;

/**
 * FOMC の政策金利発表。出典は FRB で、条件は出所の記載だけ（全体設計書 §5.1）。
 *
 * 声明は会合2日目の米東部時間 14:00 に出る。日付・時刻はJSTで入れるため
 * （設計書 §4.1）、夏時間の期間は翌日 3:00、冬時間は翌日 4:00 になる。下の値は
 * IANAのタイムゾーンデータで換算したもので、目視で足したものではない。
 *
 * 会合は現地で2日間あるが、単日で入れる。利用者に効くのは声明が出る1点で、
 * 初日をカレンダーに出すと1日2件のセル枠を1つ食う（設計書 §10.2）。現地の
 * 会合日は `note` に残す。
 *
 * 掲載は2027年12月まで（FRB のカレンダー）。それ以降は読み直して足す。
 */
const MARKET_EVENTS = [
  {
    title: "FOMC 政策金利発表（2026年9月）",
    startDate: "2026-09-17",
    time: "03:00",
    note: "会合は現地時間9月15〜16日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2026年10月）",
    startDate: "2026-10-29",
    time: "03:00",
    note: "会合は現地時間10月27〜28日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2026年12月）",
    startDate: "2026-12-10",
    time: "04:00",
    note: "会合は現地時間12月8〜9日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年1月）",
    startDate: "2027-01-28",
    time: "04:00",
    note: "会合は現地時間1月26〜27日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年3月）",
    startDate: "2027-03-18",
    time: "03:00",
    note: "会合は現地時間3月16〜17日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年4月）",
    startDate: "2027-04-29",
    time: "03:00",
    note: "会合は現地時間4月27〜28日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年6月）",
    startDate: "2027-06-10",
    time: "03:00",
    note: "会合は現地時間6月8〜9日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年7月）",
    startDate: "2027-07-29",
    time: "03:00",
    note: "会合は現地時間7月27〜28日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年9月）",
    startDate: "2027-09-16",
    time: "03:00",
    note: "会合は現地時間9月14〜15日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年10月）",
    startDate: "2027-10-28",
    time: "03:00",
    note: "会合は現地時間10月26〜27日。日本時間の発表時刻",
  },
  {
    title: "FOMC 政策金利発表（2027年12月）",
    startDate: "2027-12-09",
    time: "04:00",
    note: "会合は現地時間12月7〜8日。日本時間の発表時刻",
  },
].map((e) => ({
  ...e,
  shortLabel: "FOMC",
  importance: 3,
  // 日本株にも効くため US ではなく GLOBAL（設計書 §4.2）
  market: "GLOBAL" as const,
  sourceName: "Federal Reserve Board",
  sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
}));

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
        [...EVENTS, ...MARKET_EVENTS].map((e) => e.title),
      ),
    );
  const have = new Set(existing.map((row) => row.title));

  const missingStockEvents = EVENTS.filter((e) => !have.has(e.title)).map(
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
  const missingMarketEvents = MARKET_EVENTS.filter((e) => !have.has(e.title));

  // 銘柄イベントは stock_id、市場イベントは market を入れる。列が違うので
  // 1回の insert にまとめず、それぞれの形のまま投入する
  if (missingStockEvents.length > 0) {
    await db.insert(event).values(missingStockEvents);
  }
  if (missingMarketEvents.length > 0) {
    await db.insert(event).values(missingMarketEvents);
  }
  return { created: missingStockEvents.length + missingMarketEvents.length };
}
