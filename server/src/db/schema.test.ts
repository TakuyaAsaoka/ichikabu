import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { expectViolation, resetDatabase } from "../../test/helpers";
import { stockInput } from "../../test/inputs";
import { db } from ".";
import { AUDIT_RESOURCES, event, stock, theme, themeStock } from "./schema";

beforeEach(resetDatabase);

/** イベントの日付列の共通部分。対象の3列だけをテストごとに変える */
const eventBase = {
  title: "テスト用イベント",
  shortLabel: "テスト",
  startDate: "2026-08-05",
  importance: 2,
} as const;

/** 既定のティッカーは `test/inputs.ts` から取る（同じ値を2か所に書かない） */
async function createStock(ticker = stockInput().ticker) {
  const [row] = await db
    .insert(stock)
    .values(stockInput({ ticker }))
    .returning();
  return row;
}

async function createTheme(name = "ドローン") {
  const [row] = await db.insert(theme).values({ name }).returning();
  return row;
}

describe("event の対象3列（市場・テーマ・銘柄）の排他", () => {
  it("market だけを入れた市場イベントは登録できる", async () => {
    const [row] = await db
      .insert(event)
      .values({ ...eventBase, market: "GLOBAL" })
      .returning();
    expect(row.market).toBe("GLOBAL");
    expect(row.themeId).toBeNull();
    expect(row.stockId).toBeNull();
  });

  it("theme_id だけを入れたテーマイベントは登録できる", async () => {
    const { id } = await createTheme();
    const [row] = await db
      .insert(event)
      .values({ ...eventBase, themeId: id })
      .returning();
    expect(row.themeId).toBe(id);
    expect(row.market).toBeNull();
  });

  it("stock_id だけを入れた銘柄イベントは登録できる", async () => {
    const { id } = await createStock();
    const [row] = await db
      .insert(event)
      .values({ ...eventBase, stockId: id })
      .returning();
    expect(row.stockId).toBe(id);
    expect(row.market).toBeNull();
  });

  it("market と stock_id を両方入れると失敗する", async () => {
    const { id } = await createStock();
    const violated = await expectViolation(
      db.insert(event).values({ ...eventBase, market: "JP", stockId: id }),
    );
    expect(violated).toBe("event_target_exclusive_check");
  });

  it("theme_id と stock_id を両方入れると失敗する", async () => {
    const stockRow = await createStock();
    const themeRow = await createTheme();
    const violated = await expectViolation(
      db
        .insert(event)
        .values({ ...eventBase, themeId: themeRow.id, stockId: stockRow.id }),
    );
    expect(violated).toBe("event_target_exclusive_check");
  });

  it("3列とも入れないと失敗する", async () => {
    const violated = await expectViolation(db.insert(event).values(eventBase));
    expect(violated).toBe("event_target_exclusive_check");
  });
});

describe("event の期間", () => {
  it("end_date が start_date より後なら登録できる", async () => {
    const [row] = await db
      .insert(event)
      .values({ ...eventBase, market: "US", endDate: "2026-08-06" })
      .returning();
    expect(row.endDate).toBe("2026-08-06");
  });

  it("end_date が start_date と同じだと失敗する（単日は end_date を空にする）", async () => {
    const violated = await expectViolation(
      db
        .insert(event)
        .values({ ...eventBase, market: "US", endDate: eventBase.startDate }),
    );
    expect(violated).toBe("event_period_check");
  });
});

describe("event の重要度と市場の値", () => {
  it("重要度に4を入れると失敗する", async () => {
    const violated = await expectViolation(
      db.insert(event).values({ ...eventBase, market: "JP", importance: 4 }),
    );
    expect(violated).toBe("event_importance_check");
  });

  // TypeScript の型でも防いでいるが、CHECK の役目は生SQLからの混入を止めることなので
  // DB側で効くことを固定する。型を通さない経路として生SQLで入れる
  it("決められていない市場は生SQLでも登録できない", async () => {
    const violated = await expectViolation(
      db.execute(sql`
        INSERT INTO "event" (title, short_label, start_date, importance, market)
        VALUES ('テスト用イベント', 'テスト', '2026-08-05', 2, 'EU')
      `),
    );
    expect(violated).toBe("event_market_check");
  });
});

describe("stock の一意性と形式", () => {
  it("同じ市場とティッカーの組は2件登録できない", async () => {
    await createStock("7203");
    const violated = await expectViolation(
      db
        .insert(stock)
        .values({ market: "JP", ticker: "7203", name: "別の会社" }),
    );
    expect(violated).toBe("stock_market_ticker_unique");
  });

  it("市場が違えば同じティッカーを登録できる", async () => {
    await createStock("7203");
    const [row] = await db
      .insert(stock)
      .values({ market: "US", ticker: "7203", name: "同名の米国銘柄" })
      .returning();
    expect(row.market).toBe("US");
  });

  it("2024年から実在する英字入りの証券コードを登録できる", async () => {
    const [row] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "130A", name: "英字入りの銘柄" })
      .returning();
    expect(row.ticker).toBe("130A");
  });

  it("全角のティッカーは登録できない", async () => {
    const violated = await expectViolation(
      db
        .insert(stock)
        .values({ market: "JP", ticker: "７２０３", name: "全角のティッカー" }),
    );
    expect(violated).toBe("stock_ticker_check");
  });

  it("US銘柄に決算月を入れると失敗する（決算月はJP銘柄のみ）", async () => {
    const violated = await expectViolation(
      db.insert(stock).values({
        market: "US",
        ticker: "AAPL",
        name: "Apple",
        fiscalMonth: 9,
      }),
    );
    expect(violated).toBe("stock_fiscal_month_market_check");
  });

  it("US銘柄でも決算月を空にすれば登録できる", async () => {
    const [row] = await db
      .insert(stock)
      .values({ market: "US", ticker: "AAPL", name: "Apple" })
      .returning();
    expect(row.fiscalMonth).toBeNull();
  });

  it("決算月に13を入れると失敗する", async () => {
    const violated = await expectViolation(
      db.insert(stock).values({
        market: "JP",
        ticker: "9999",
        name: "会社",
        fiscalMonth: 13,
      }),
    );
    expect(violated).toBe("stock_fiscal_month_check");
  });

  it("決められていない市場は生SQLでも登録できない", async () => {
    const violated = await expectViolation(
      db.execute(sql`
        INSERT INTO "stock" (market, ticker, name) VALUES ('EU', 'ASML', 'ASML')
      `),
    );
    expect(violated).toBe("stock_market_check");
  });
});

describe("外部キーの削除時の挙動", () => {
  it("イベントに使われている銘柄は削除できない", async () => {
    const { id } = await createStock();
    await db.insert(event).values({ ...eventBase, stockId: id });

    const violated = await expectViolation(
      db.delete(stock).where(eq(stock.id, id)),
    );
    expect(violated).toBe("event_stock_id_stock_id_fk");
  });

  it("銘柄を削除するとテーマ所属も消える", async () => {
    const stockRow = await createStock();
    const themeRow = await createTheme();
    await db
      .insert(themeStock)
      .values({ themeId: themeRow.id, stockId: stockRow.id });

    await db.delete(stock).where(eq(stock.id, stockRow.id));

    expect(await db.select().from(themeStock)).toEqual([]);
  });

  it("テーマを削除するとテーマ所属も消える", async () => {
    const stockRow = await createStock();
    const themeRow = await createTheme();
    await db
      .insert(themeStock)
      .values({ themeId: themeRow.id, stockId: stockRow.id });

    await db.delete(theme).where(eq(theme.id, themeRow.id));

    expect(await db.select().from(themeStock)).toEqual([]);
  });

  it("イベントに使われているテーマは削除できない", async () => {
    const { id } = await createTheme();
    await db.insert(event).values({ ...eventBase, themeId: id });

    const violated = await expectViolation(
      db.delete(theme).where(eq(theme.id, id)),
    );
    expect(violated).toBe("event_theme_id_theme_id_fk");
  });

  it("銘柄とテーマを参照する外部キーは restrict か cascade で宣言されている", async () => {
    // onDelete を省くと既定の no action になり、削除を弾いたときのコードが
    // 23001 ではなく 23503 になる。src/db/write.ts の DELETE_MESSAGES を通らず
    // 「その銘柄は無い」という正反対の文が戻る（銘柄・テーマの編集 設計書 §2）。
    // confdeltype は a=no action、r=restrict、c=cascade
    const rows = await db.execute<{ conname: string; confdeltype: string }>(sql`
      SELECT c.conname, c.confdeltype
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.confrelid
       WHERE c.contype = 'f'
         AND t.relname IN ('stock', 'theme')
       ORDER BY c.conname
    `);

    expect(rows.rows.length).toBeGreaterThan(0);
    expect(
      rows.rows.filter((row) => !["r", "c"].includes(row.confdeltype)),
    ).toEqual([]);
  });
});

describe("theme の一意性", () => {
  it("同じ名前のテーマは2件登録できない", async () => {
    await createTheme("ドローン");
    const violated = await expectViolation(
      db.insert(theme).values({ name: "ドローン" }),
    );
    expect(violated).toBe("theme_name_unique");
  });
});

describe("AUDIT_RESOURCES", () => {
  // 値は audit_log.resource_type の型そのもので、書き込みだけでなく読み出しの型も
  // これで決まる。実在しないテーブル名が混ざっていても TypeScript は気づけないため、
  // DBに問い合わせて確かめる（Issue #98）
  it("並んでいる値はすべてDBに実在するテーブル名である", async () => {
    const { rows } = await db.execute<{ tablename: string }>(sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    const tables = new Set(rows.map((row) => row.tablename));
    expect(AUDIT_RESOURCES.filter((name) => !tables.has(name))).toEqual([]);
  });
});

describe("theme_stock の複合主キー", () => {
  it("同じテーマと銘柄の組は2件登録できない", async () => {
    const stockRow = await createStock();
    const themeRow = await createTheme();
    const values = { themeId: themeRow.id, stockId: stockRow.id };
    await db.insert(themeStock).values(values);

    const violated = await expectViolation(
      db.insert(themeStock).values(values),
    );
    expect(violated).toBe("theme_stock_theme_id_stock_id_pk");
  });
});
