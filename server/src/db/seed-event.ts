import { and, eq, inArray } from "drizzle-orm";
import { db } from ".";
import { event, stock } from "./schema";

/**
 * 開発中の表示確認に使うデータ（Issue #8 設計書 §3）。
 *
 * 入れられるのは、全体設計書 §5.1 の表で「使う」になっている出典で日付を
 * 確認できるものだけになる。今は各社のIRページ（銘柄イベント）と、FRB・BLS・
 * 総務省統計局（市場イベント）の4つ。テーマイベントは、テーマ固有の出来事の
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
 * 市場イベントの1行。対象は `market` の1列だけで表す（設計書 §5）。
 * `note` は塊ごとに同じ文言でよければ下の共通値のほうに書く
 */
type MarketEventRow = {
  title: string;
  startDate: string;
  time: string;
  note?: string;
};

/**
 * 同じ略号・重要度・出典を持つ市場イベントの塊を作る。
 * 対象の既定は `GLOBAL`。日本株にも効く出来事だからで、`US` にすると
 * 米国株の保有者にしか出ない（設計書 §4.2）。日本の指標だけ `JP` を渡す
 */
function marketEvents(
  common: {
    shortLabel: string;
    importance: number;
    sourceName: string;
    sourceUrl: string;
    note?: string;
    market?: "JP" | "US" | "GLOBAL";
  },
  rows: MarketEventRow[],
) {
  const { market = "GLOBAL", ...rest } = common;
  return rows.map((row) => ({ ...rest, ...row, market }));
}

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
const FOMC_EVENTS = marketEvents(
  {
    shortLabel: "FOMC",
    importance: 3,
    sourceName: "Federal Reserve Board",
    sourceUrl:
      "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  },
  [
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
  ],
);

/**
 * 米国の経済指標。出典は BLS（米労働統計局）で、条件は出所の記載だけ
 * （全体設計書 §5.1）。
 *
 * どちらも公表は米東部時間 8:30 で、日本時間では同じ日の夜になる
 * （夏時間は 21:30、冬時間は 22:30）。FOMC と違って日付は変わらない。
 *
 * 掲載は2026年12月分まで（BLS の公表予定）。FOMC より短いので、先に
 * 足りなくなる。`bls.gov` はプログラムからのアクセスに 403 を返すため、
 * 読み直すときはブラウザで開く。
 *
 * 重要度は FOMC の3に対して2にした。★3だけを強調する表示（設計書 §10.2）で、
 * 月に3件も★3が並ぶと強調の意味が薄れるため
 */
const CPI_EVENTS = marketEvents(
  {
    shortLabel: "米CPI",
    importance: 2,
    sourceName: "U.S. Bureau of Labor Statistics",
    sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
    note: "米東部時間 8:30 の公表を日本時間に直した時刻",
  },
  [
    {
      title: "米消費者物価指数（2026年7月分）",
      startDate: "2026-08-12",
      time: "21:30",
    },
    {
      title: "米消費者物価指数（2026年8月分）",
      startDate: "2026-09-11",
      time: "21:30",
    },
    {
      title: "米消費者物価指数（2026年9月分）",
      startDate: "2026-10-14",
      time: "21:30",
    },
    {
      title: "米消費者物価指数（2026年10月分）",
      startDate: "2026-11-10",
      time: "22:30",
    },
    {
      title: "米消費者物価指数（2026年11月分）",
      startDate: "2026-12-10",
      time: "22:30",
    },
  ],
);

const EMPLOYMENT_EVENTS = marketEvents(
  {
    shortLabel: "米雇用統計",
    importance: 2,
    sourceName: "U.S. Bureau of Labor Statistics",
    sourceUrl: "https://www.bls.gov/schedule/news_release/empsit.htm",
    note: "米東部時間 8:30 の公表を日本時間に直した時刻",
  },
  [
    {
      title: "米雇用統計（2026年8月分）",
      startDate: "2026-09-04",
      time: "21:30",
    },
    {
      title: "米雇用統計（2026年9月分）",
      startDate: "2026-10-02",
      time: "21:30",
    },
    {
      title: "米雇用統計（2026年10月分）",
      startDate: "2026-11-06",
      time: "22:30",
    },
    {
      title: "米雇用統計（2026年11月分）",
      startDate: "2026-12-04",
      time: "22:30",
    },
  ],
);

/**
 * 日本の消費者物価指数。出典は総務省統計局で、条件は出所の記載だけ
 * （全体設計書 §2.1）。
 *
 * 対象は `JP`。米CPI を `GLOBAL` にしているのは日本株にも効くからで、
 * 日本のCPI は米国株の保有者には効かない（公表予定の取り込み設計書 §1 #8）。
 *
 * 下の3件は公表予定 XML から取った実物。`pnpm import:stat` を実行すると
 * 同じ出所から15件が入る（うち3件はここで入っているので登録は12件になる）。
 * ここに置いてあるのは、取り込みを動かさなくても日本の指標が1件は見えるようにするため
 */
const JP_CPI_EVENTS = marketEvents(
  {
    shortLabel: "日本CPI",
    importance: 2,
    market: "JP",
    sourceName: "総務省統計局",
    sourceUrl: "https://www.stat.go.jp/data/cpi/",
  },
  [
    {
      title: "消費者物価指数（2026年6月分）",
      startDate: "2026-07-24",
      time: "08:30",
    },
    {
      title: "消費者物価指数（2026年7月分）",
      startDate: "2026-08-21",
      time: "08:30",
    },
    {
      title: "消費者物価指数（2026年8月分）",
      startDate: "2026-09-18",
      time: "08:30",
    },
  ],
);

const MARKET_EVENTS = [
  ...FOMC_EVENTS,
  ...CPI_EVENTS,
  ...EMPLOYMENT_EVENTS,
  ...JP_CPI_EVENTS,
];

/**
 * 銘柄とイベントを投入する。何度実行しても増えない。
 * 銘柄は一意の制約があるので衝突を無視し、
 * イベントには一意の制約が無いため、見出しで既にあるかを判定する。
 */
export async function seedEvents(): Promise<{ created: number }> {
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
