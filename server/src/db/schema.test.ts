import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { expectViolation, resetDatabase } from "../../test/helpers";
import { db } from ".";
import { event, holding, stock, theme, themeStock, user } from "./schema";

beforeEach(resetDatabase);

/** イベントの日付列の共通部分。対象の3列だけをテストごとに変える */
const eventBase = {
  title: "テスト用イベント",
  shortLabel: "テスト",
  startDate: "2026-08-05",
  importance: 2,
} as const;

async function createStock(ticker = "7203") {
  const [row] = await db
    .insert(stock)
    .values({ market: "JP", ticker, name: "トヨタ自動車", fiscalMonth: 3 })
    .returning();
  return row;
}

async function createTheme(name = "ドローン") {
  const [row] = await db.insert(theme).values({ name }).returning();
  return row;
}

async function createUser(id = "user-1") {
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: "運用者",
      email: `${id}@example.com`,
      updatedAt: new Date(),
    })
    .returning();
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
    expect(violated).toBe("event_target_check");
  });

  it("theme_id と stock_id を両方入れると失敗する", async () => {
    const stockRow = await createStock();
    const themeRow = await createTheme();
    const violated = await expectViolation(
      db
        .insert(event)
        .values({ ...eventBase, themeId: themeRow.id, stockId: stockRow.id }),
    );
    expect(violated).toBe("event_target_check");
  });

  it("3列とも入れないと失敗する", async () => {
    const violated = await expectViolation(db.insert(event).values(eventBase));
    expect(violated).toBe("event_target_check");
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

  it("重要度に4を入れると失敗する", async () => {
    const violated = await expectViolation(
      db.insert(event).values({ ...eventBase, market: "JP", importance: 4 }),
    );
    expect(violated).toBe("event_importance_check");
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

  it("保有されている銘柄は削除できない", async () => {
    const stockRow = await createStock();
    const userRow = await createUser();
    await db
      .insert(holding)
      .values({ userId: userRow.id, stockId: stockRow.id });

    const violated = await expectViolation(
      db.delete(stock).where(eq(stock.id, stockRow.id)),
    );
    expect(violated).toBe("holding_stock_id_stock_id_fk");
  });

  it("ユーザーを削除すると保有も消える", async () => {
    const stockRow = await createStock();
    const userRow = await createUser();
    await db
      .insert(holding)
      .values({ userId: userRow.id, stockId: stockRow.id });

    await db.delete(user).where(eq(user.id, userRow.id));

    expect(await db.select().from(holding)).toEqual([]);
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
});

describe("holding の複合主キー", () => {
  it("同じユーザーと銘柄の組は2件登録できない", async () => {
    const stockRow = await createStock();
    const userRow = await createUser();
    const values = { userId: userRow.id, stockId: stockRow.id };
    await db.insert(holding).values(values);

    const violated = await expectViolation(db.insert(holding).values(values));
    expect(violated).toBe("holding_user_id_stock_id_pk");
  });
});
