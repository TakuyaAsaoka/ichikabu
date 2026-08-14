import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
/** 市場イベントの対象。管理UIの選択肢もここから作る */
export const EVENT_MARKETS = ["JP", "US", "GLOBAL"] as const;

/**
 * 監査ログの操作の区分（監査ログ 設計書 §5.1）。
 * `create_event` のように対象を混ぜない。対象は `resource_type` が別に持つ
 */
export const AUDIT_ACTIONS = ["create", "update", "delete"] as const;
/**
 * 記録の対象。値はDBのテーブル名そのもので、実在するテーブルだけを並べる。
 * この列は書き込みだけでなく読み出しの型も決めるため、DBに在る文字列を
 * 落とすと、その行を読んだときに型が嘘をつく。
 * 実在するかは `src/db/schema.test.ts` がDBに問い合わせて確かめている
 */
export const AUDIT_RESOURCES = [
  "stock",
  "theme",
  "event",
  "theme_stock",
] as const;

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

// theme_stock は他から参照されないため、サロゲートIDを持たず複合PKにする（設計書 §4.2）。

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

/**
 * 誰がいつ何を作成・更新・削除したかの記録（監査ログ 設計書 §5.1）。
 * **書くのは `src/db/audit.ts` だけ**で、他のどこからも insert しない。
 *
 * IPアドレスとブラウザの種類は持たない。入力者は身内3人で、追跡する相手がいない
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /**
     * 操作した利用者。取り込みスクリプトなど人以外は NULL。
     *
     * `onDelete` は restrict にする。**この表は過去の事実の記録で、他の表への
     * DELETE で書き換わってはならない。** set null にすると、入力者を1人消した
     * 瞬間にその人の記録が NULL になり、「取り込みがイベントを削除した」という
     * 実際には起こりえない行が §5.5 の集計に出る（`upsertMarketEvents` に
     * DELETE は無い）。`seedUser` は `crypto.randomUUID()` で採番するので、
     * 同じメールアドレスで入れ直しても紐づけは戻せない。
     *
     * これで `user` の行は消せなくなるが、困らない。
     * 入力者をやめさせるのに `user` の行を消す必要は無い。メールアドレスを
     * 書き換えれば、パスワードでも Google でもサインインできなくなる
     * （Google の初回サインインは `src/auth.ts` のフックが拒む）
     */
    userId: text("user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    /**
     * `stock.market` と違い、CHECK 制約は置かない。
     * あちらは画面から来た生の文字列をそのまま渡してDBに判定させる形だが、
     * この2列に入る値は `src/db/audit.ts` が書く決まった文字列だけで、
     * 外から届く経路が無い。`text({ enum })` は TypeScript 側の型だけを絞る
     */
    action: text({ enum: AUDIT_ACTIONS }).notNull(),
    resourceType: text("resource_type", { enum: AUDIT_RESOURCES }).notNull(),
    /** 主キーの値。複合主キーの表は ":" でつないだ文字列 */
    resourceId: text("resource_id").notNull(),
    /**
     * 変更前の行まるごと。削除ではこれが消えた行の唯一の写しで、
     * `jsonb_populate_record` で戻せる（設計書 §5.4）
     */
    previousValues: jsonb("previous_values").$type<Record<string, unknown>>(),
    /** 変更後の行まるごと */
    newValues: jsonb("new_values").$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt.desc()),
    index("audit_log_user_id_idx").on(t.userId),
    // 「このイベントを登録したのは誰か」を引くための索引。resource_type だけの
    // 索引では行を絞れない（設計書 §5.1）
    index("audit_log_resource_idx").on(
      t.resourceType,
      t.resourceId,
      t.createdAt,
    ),
  ],
);
