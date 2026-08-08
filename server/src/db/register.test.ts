import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../../test/helpers";
import { db } from ".";
import { createHolding, createStock } from "./register";
import { holding, stock } from "./schema";
import { seedUser } from "./seed-user";

const TOYOTA = {
  market: "JP",
  ticker: "7203",
  name: "トヨタ自動車",
  fiscalMonth: 3,
} as const;

beforeEach(resetDatabase);

describe("createStock", () => {
  it("銘柄を登録するとDBに行が入る", async () => {
    expect(await createStock({ ...TOYOTA })).toBeNull();

    const rows = await db.select().from(stock);
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe("7203");
    expect(rows[0].fiscalMonth).toBe(3);
  });

  it("同じ市場とティッカーをもう一度登録するとエラー文が返る", async () => {
    await createStock({ ...TOYOTA });

    expect(await createStock({ ...TOYOTA, name: "別名で再登録" })).toBe(
      "その市場のティッカーは登録済み",
    );
    expect(await db.select().from(stock)).toHaveLength(1);
  });

  it("英字入りのティッカーを登録できる", async () => {
    // 全体設計書 §4.2「ticker は文字列」の検証。数値型だと 130A が入らない
    expect(
      await createStock({
        market: "JP",
        ticker: "130A",
        name: "英字入りティッカーの銘柄",
        fiscalMonth: 12,
      }),
    ).toBeNull();
  });

  it("全角のティッカーはエラー文が返る", async () => {
    // 全角の「７２０３」が半角の「7203」と別銘柄として登録されるのを防ぐ
    expect(await createStock({ ...TOYOTA, ticker: "７２０３" })).toBe(
      "ティッカーは半角の数字・英大文字・ピリオド・ハイフンだけ使える",
    );
  });

  it("US銘柄に決算月を入れるとエラー文が返る", async () => {
    // 決算月はJP銘柄のみ。US銘柄に入るとJPの休場日カレンダーで計算した
    // 権利確定日がUS銘柄に出てしまう（全体設計書 §4.1）
    expect(
      await createStock({
        market: "US",
        ticker: "AAPL",
        name: "Apple",
        fiscalMonth: 9,
      }),
    ).toBe("決算月はJP銘柄にだけ入れられる");
  });

  it("市場がJPでもUSでもないとエラー文が返る", async () => {
    expect(
      await createStock({
        market: "XX",
        ticker: "9999",
        name: "不正な市場",
        fiscalMonth: null,
      }),
    ).toBe("市場は JP か US");
    expect(await db.select().from(stock)).toHaveLength(0);
  });

  it("US銘柄は決算月なしで登録できる", async () => {
    expect(
      await createStock({
        market: "US",
        ticker: "AAPL",
        name: "Apple",
        fiscalMonth: null,
      }),
    ).toBeNull();
  });
});

describe("createHolding", () => {
  let userId: string;
  let stockId: number;

  beforeEach(async () => {
    // holding.user_id は Better Auth の user への外部キー。
    // resetDatabase が user も消すため、毎回作り直す（設計書 §7 D）
    ({ userId } = await seedUser(
      "dev@example.com",
      "correct-horse-battery-staple",
    ));
    await createStock({ ...TOYOTA });
    const [row] = await db
      .select()
      .from(stock)
      .where(eq(stock.ticker, TOYOTA.ticker));
    stockId = row.id;
  });

  it("保有を登録するとDBに行が入る", async () => {
    expect(await createHolding(userId, stockId)).toBeNull();

    const rows = await db.select().from(holding);
    expect(rows).toHaveLength(1);
    expect(rows[0].stockId).toBe(stockId);
    expect(rows[0].userId).toBe(userId);
  });

  it("同じ銘柄をもう一度保有に登録するとエラー文が返る", async () => {
    await createHolding(userId, stockId);

    expect(await createHolding(userId, stockId)).toBe(
      "その銘柄はすでに保有に登録済み",
    );
    expect(await db.select().from(holding)).toHaveLength(1);
  });
});
