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

// Better Auth が生成したテーブルも同じマイグレーション履歴で管理する。
export * from "./auth-schema";

// market は PostgreSQL の列挙型ではなく text + CHECK で持つ。
// 列挙型だと stock.market（JP/US）と event.market（JP/US/GLOBAL）が別の型になり、
// SQL で比べると実行時エラーになる。1つの列挙型にまとめれば比べられるが、
// 列挙型は値を消せない（`ALTER TYPE ... DROP VALUE` が無い）ため、値を変えるたびに
// 型を作り直すことになる。text + CHECK なら CHECK の付け替え1回で済む。
const MARKETS = ["JP", "US"] as const;
/** 市場イベントの対象。管理UIの選択肢もここから作る */
export const EVENT_MARKETS = ["JP", "US", "GLOBAL"] as const;

/**
 * 監査ログの操作の区分。
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

/**
 * 作成日時。全テーブルが持つ。DBのデフォルト値で入るためアプリからは書かない。
 * 後から列を足しても、それまでの行は空のまま埋められないため最初から持つ
 */
const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const stock = pgTable(
  "stock",
  {
    // stock・theme・event の主キーは、DBが振るだけの連番にする。(market, ticker) を
    // 主キーにすると、ティッカーの変更で参照する側の行まで書き換えることになる。
    // serial でなく識別列にするのは、serial が ID を明示した INSERT を黙って通し、
    // 採番がその値に追いついた日に重複キー違反で止まるため
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    market: text({ enum: MARKETS }).notNull(),
    /** 数値型にしない。日本の証券コードは2024年から英字入り（`130A` 等）がある */
    ticker: text().notNull(),
    name: text().notNull(),
    /**
     * 決算月（1〜12）。JP銘柄のみ。権利確定日の計算に使う。
     * 権利確定日・配当落ち日はイベントとして保存せず、この列と休場日リストから計算する
     */
    fiscalMonth: smallint("fiscal_month"),
    createdAt,
  },
  (t) => [
    unique().on(t.market, t.ticker),
    check("stock_market_check", sql`${t.market} IN ('JP', 'US')`),
    // 全角の「７２０３」が半角の「7203」と別銘柄として UNIQUE を素通りするのを防ぐ
    check("stock_ticker_check", sql`${t.ticker} ~ '^[0-9A-Z.-]+$'`),
    check("stock_fiscal_month_check", sql`${t.fiscalMonth} BETWEEN 1 AND 12`),
    // 決算月はJP銘柄のみ。US銘柄に入ると、JPの休場日カレンダーで
    // 計算した権利確定日がUS銘柄に出てしまう。
    // US銘柄の権利日は計算しない。米国の配当の基準日は四半期ごとに取締役会が決めて
    // 公表するもので、決算期末とは関係が無い。US の休場日リストを足しても出せない。
    // 要るときは銘柄イベントとして管理UIから手で登録する
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

// theme_stock は他から参照されないため、サロゲートIDを持たず複合PKにする。

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

// 作らなかった列と理由。
// - 日付の粒度（`precision` = day/month）: 実際の粒度は「上旬」「秋」「年内」まであり
//   2値では表せない。日付が日単位で確定してから登録する（決算日は発表の約1か月前に
//   確定し、経済指標は日付が決まった形で公表される）
// - 「日付未定」: 月すら分からないイベントはカレンダーに描く場所が無いので登録しない。
//   `start_date` を NULL 可にしない
// - 書き込んだ経路（`event.source` = manual/auto）: 経路は管理UIと `pnpm import:stat` の
//   2つあるが、区別して使う場面が無い。`source_url` と違い、後から足しても既存行に
//   正しい値を入れられる
// - 作成者（`created_by`・`updated_by`）: 行を消すと列も消え、誰が消したかを出せない。
//   監査ログ（`audit_log`）から作成者も削除も出せるので、列を足しても監査ログは要る
// - 論理削除（`deleted_at`）: 削除は行を消す。列を足すと全部の問い合わせに絞り込みが
//   要り、漏れる。消した行は `audit_log.previous_values` から戻せる。
//   `active` は取り込みが使う表示の切り替えで、削除の印ではない
// - 監査ログを書くDBのトリガー: drizzle-kit はトリガーを生成せず、手書きの SQL が
//   このファイルの外に置かれる。監査ログは `src/db/audit.ts` が書く
export const event = pgTable(
  "event",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: text().notNull(),
    /**
     * カレンダーのセルに出す略号。正式名称はシートにだけ出す。
     * タイトルを機械的に縮めると意味が消える（「令和9年度予算概算要求」→「令和9年度…」）
     * ので、登録者が付ける。
     * 幅の上限は CHECK にせず `src/db/write.ts` で判定する。セル幅から出た表示の決まりで、
     * フォントや余白で動くため、CHECK にすると変えるたびにマイグレーションが要る
     */
    shortLabel: text("short_label").notNull(),
    /**
     * 日付は開始・終了・時刻の3列で持つ。
     * 1列の date では期間（3日間の会議）も時刻（FOMC）も表せない
     */
    startDate: date("start_date").notNull(),
    /** NULL は単日を表す。start_date と同じ値を入れてはならない（下の CHECK で禁止） */
    endDate: date("end_date"),
    /** JST。FOMC のように日本時間で翌日未明になるものは、登録者がJSTに直して入れる */
    time: time(),
    /** 重要度（★1〜3）。「今週は荒れるか」に答えるために持つ */
    importance: smallint().notNull(),
    note: text(),
    /**
     * カレンダーに出すかどうか。
     * 取り込みが「これからの回なのに最新の公表予定に載らなくなった行」を false にする。
     * 手で登録する行は既定の true。false の行は `GET /events` が返さない
     */
    active: boolean().notNull().default(true),
    /**
     * この日付をどこで確認したかの記録。
     * 後から列を足しても、それまでに登録した行の出典は戻せないため最初から持つ
     */
    sourceUrl: text("source_url"),
    /**
     * 画面に出す出典の名前（`内閣府（PDL1.0）` 等）。出典の記載を条件とする
     * 出典を使うために要る。何を書くかは運用者が決める
     */
    sourceName: text("source_name"),
    // 以下3列でイベントの種別を表す。ちょうど1つだけが非NULL。
    // market は「全員」を NULL で表さず GLOBAL と書く。NULL にすると
    // `market = 'JP' OR market IS NULL` のような条件が全部の問い合わせに要り、漏れる
    market: text({ enum: EVENT_MARKETS }),
    // テーマ・銘柄を消しても、人の手で登録したイベントを黙って道連れにしない（restrict）。
    // set null は対象の3列が全部 NULL になり、下の排他の CHECK に反する
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
    // 市場イベント・テーマイベント・銘柄イベントの排他。
    // `target_type` + `target_id` の形は外部キーを張れず、消えたテーマを指す行を防げない。
    // 対象を別テーブル（`event_target`）に出すと排他が2テーブルにまたがり、CHECK では
    // 書けずトリガーが要る。3列を同じ行に並べればこの CHECK 1行で済む。
    // 引き換えに、1つのイベントが持てる対象はちょうど1つになる。2銘柄・2テーマに効く出来事は
    // 専用のテーマを作るか片方に寄せるしかない。入力者だけが使う間は実害が無く、
    // 他の人に公開して困ったら別テーブルへ戻す。そのとき回避策で作ったテーマは自動では戻らない
    check(
      "event_target_exclusive_check",
      sql`num_nonnulls(${t.market}, ${t.themeId}, ${t.stockId}) = 1`,
    ),
    // 出典の名前があるならURLも要る。名前だけだと、画面に出した出典から元のページへ
    // たどれない。逆（URLだけ）は許す。source_url は運用者が誤登録を追うための記録で、
    // 画面に出さない使い方があるため
    check(
      "event_source_name_check",
      sql`${t.sourceName} IS NULL OR ${t.sourceUrl} IS NOT NULL`,
    ),
    // 単日は end_date IS NULL でのみ表す。= を許すと単日の表現が2通りになる
    check(
      "event_period_check",
      sql`${t.endDate} IS NULL OR ${t.endDate} > ${t.startDate}`,
    ),
  ],
);

/**
 * 誰がいつ何を作成・更新・削除したかの記録。
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
     * 実際には起こりえない行が入力者ごとの集計（`countByUser`）に出る
     * （`upsertMarketEvents` に DELETE は無い）。`seedUser` は `crypto.randomUUID()` で
     * 採番するので、同じメールアドレスで入れ直しても紐づけは戻せない。
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
     * `jsonb_populate_record` で戻せる
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
    // 索引では行を絞れない
    index("audit_log_resource_idx").on(
      t.resourceType,
      t.resourceId,
      t.createdAt,
    ),
  ],
);
