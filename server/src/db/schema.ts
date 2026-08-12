import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Better Auth が生成したテーブルも同じマイグレーション履歴で管理する（設計書 §9）。
export * from "./auth-schema";

// market は PostgreSQL の列挙型ではなく text + CHECK で持つ。
// 列挙型だと stock.market と event.market が別の型になり比較できず、
// §5 の判定 `event.market IN (SELECT stock.market ...)` が実行時エラーになる（設計書 §4.2）。
const MARKETS = ["JP", "US"] as const;
const EVENT_MARKETS = ["JP", "US", "GLOBAL"] as const;

/** 作成日時。全テーブルが持つ（設計書 §4.1）。DBのデフォルト値で入るためアプリからは書かない */
const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const stock = pgTable(
  "stock",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    market: text({ enum: MARKETS }).notNull(),
    ticker: text().notNull(),
    name: text().notNull(),
    /** 決算月（1〜12）。JP銘柄のみ。権利確定日の計算に使う（設計書 §4.2） */
    fiscalMonth: smallint("fiscal_month"),
    createdAt,
  },
  (t) => [
    unique().on(t.market, t.ticker),
    check("stock_market_check", sql`${t.market} IN ('JP', 'US')`),
    // 全角の「７２０３」が半角の「7203」と別銘柄として UNIQUE を素通りするのを防ぐ（設計書 §4.2）
    check("stock_ticker_check", sql`${t.ticker} ~ '^[0-9A-Z.-]+$'`),
    check("stock_fiscal_month_check", sql`${t.fiscalMonth} BETWEEN 1 AND 12`),
    // 決算月はJP銘柄のみ（設計書 §4.1）。US銘柄に入ると、JPの休場日カレンダーで
    // 計算した権利確定日がUS銘柄に出てしまう（→ 設計書 §14 #8）
    check(
      "stock_fiscal_month_market_check",
      sql`${t.market} = 'JP' OR ${t.fiscalMonth} IS NULL`,
    ),
  ],
);

export const theme = pgTable("theme", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
  createdAt,
});

// holding と theme_stock は他から参照されないため、サロゲートIDを持たず複合PKにする（設計書 §4.2）。

export const holding = pgTable(
  "holding",
  {
    // Better Auth の user.id は text
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stockId: integer("stock_id")
      .notNull()
      .references(() => stock.id, { onDelete: "restrict" }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.stockId] })],
);

export const themeStock = pgTable(
  "theme_stock",
  {
    themeId: integer("theme_id")
      .notNull()
      .references(() => theme.id, { onDelete: "cascade" }),
    stockId: integer("stock_id")
      .notNull()
      .references(() => stock.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.themeId, t.stockId] })],
);

export const event = pgTable(
  "event",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: text().notNull(),
    /** カレンダーのセルに出す略号。正式名称はシートにだけ出す（設計書 §10.2） */
    shortLabel: text("short_label").notNull(),
    startDate: date("start_date").notNull(),
    /** NULL は単日を表す。start_date と同じ値を入れてはならない（下の CHECK で禁止） */
    endDate: date("end_date"),
    /** JST。FOMC のように日本時間で翌日未明になるものは、登録者がJSTに直して入れる */
    time: time(),
    importance: smallint().notNull(),
    note: text(),
    /**
     * カレンダーに出すかどうか（公表予定の非アクティブ化 設計書 §1）。
     * 取り込みが「これからの回なのに最新の公表予定に載らなくなった行」を false にする。
     * 手で登録する行は既定の true。false の行は `GET /events` が返さない
     */
    active: boolean().notNull().default(true),
    /** この日付をどこで確認したかの記録（設計書 §4.2） */
    sourceUrl: text("source_url"),
    /**
     * 画面に出す出典の名前（`内閣府（PDL1.0）` 等）。出典の記載を条件とする
     * 出典を使うために要る。何を書くかは運用者が決める（出典表示設計書 §3.2）
     */
    sourceName: text("source_name"),
    // 以下3列でイベントの種別を表す。ちょうど1つだけが非NULL（設計書 §5）。
    market: text({ enum: EVENT_MARKETS }),
    themeId: integer("theme_id").references(() => theme.id, {
      onDelete: "restrict",
    }),
    stockId: integer("stock_id").references(() => stock.id, {
      onDelete: "restrict",
    }),
    createdAt,
  },
  (t) => [
    check("event_importance_check", sql`${t.importance} BETWEEN 1 AND 3`),
    check("event_market_check", sql`${t.market} IN ('JP', 'US', 'GLOBAL')`),
    // 市場イベント・テーマイベント・銘柄イベントの排他。未決事項 #5 の決着（設計書 §4.2）
    check(
      "event_target_exclusive_check",
      sql`num_nonnulls(${t.market}, ${t.themeId}, ${t.stockId}) = 1`,
    ),
    // 出典の名前があるならURLも要る。名前だけだと、画面に出した出典から元のページへ
    // たどれない。逆（URLだけ）は許す。source_url は運用者が誤登録を追うための記録で、
    // 画面に出さない使い方があるため（全体設計書 §4.2、出典表示設計書 §3.1）
    check(
      "event_source_name_check",
      sql`${t.sourceName} IS NULL OR ${t.sourceUrl} IS NOT NULL`,
    ),
    // 単日は end_date IS NULL でのみ表す。= を許すと単日の表現が2通りになる（設計書 §4.2）
    check(
      "event_period_check",
      sql`${t.endDate} IS NULL OR ${t.endDate} > ${t.startDate}`,
    ),
  ],
);
