import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../../test/helpers";
import { db } from ".";
import {
  createEvent,
  createHolding,
  createStock,
  type EventInput,
} from "./register";
import { event, holding, stock, theme } from "./schema";
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

describe("createEvent", () => {
  /**
   * 対象3列がすべて null の土台。各テストが1列だけ埋める。
   * 短縮ラベル「日銀会合」は全角4文字（幅8）で、幅の判定には引っかからない
   */
  const BASE: EventInput = {
    title: "日本銀行 金融政策決定会合",
    shortLabel: "日銀会合",
    startDate: "2026-09-18",
    endDate: null,
    time: null,
    importance: 3,
    note: null,
    sourceUrl: null,
    market: null,
    themeId: null,
    stockId: null,
  };

  /** 対象を1つだけ持つ行が1件だけ入ったことを確かめる */
  async function onlyEvent() {
    const rows = await db.select().from(event);
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it("市場イベントを登録するとDBに行が入る", async () => {
    expect(await createEvent({ ...BASE, market: "GLOBAL" })).toBeNull();

    const row = await onlyEvent();
    expect(row.market).toBe("GLOBAL");
    expect(row.themeId).toBeNull();
    expect(row.stockId).toBeNull();
  });

  it("テーマイベントを登録するとDBに行が入る", async () => {
    // テーマの登録画面はまだ無い（設計書 §9）ため、テストからは直接入れる
    const [{ id: themeId }] = await db
      .insert(theme)
      .values({ name: "半導体" })
      .returning({ id: theme.id });

    expect(await createEvent({ ...BASE, themeId })).toBeNull();

    const row = await onlyEvent();
    expect(row.themeId).toBe(themeId);
    expect(row.market).toBeNull();
    expect(row.stockId).toBeNull();
  });

  it("銘柄イベントを登録するとDBに行が入る", async () => {
    await createStock({ ...TOYOTA });
    const [{ id: stockId }] = await db
      .select({ id: stock.id })
      .from(stock)
      .where(eq(stock.ticker, TOYOTA.ticker));

    expect(await createEvent({ ...BASE, stockId })).toBeNull();

    const row = await onlyEvent();
    expect(row.stockId).toBe(stockId);
    expect(row.market).toBeNull();
    expect(row.themeId).toBeNull();
  });

  it("対象を1つも選ばないとエラー文が返る", async () => {
    expect(await createEvent({ ...BASE })).toBe(
      "対象は市場・テーマ・銘柄のどれか1つを選ぶ",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("対象を2つ選ぶとエラー文が返る", async () => {
    const [{ id: themeId }] = await db
      .insert(theme)
      .values({ name: "半導体" })
      .returning({ id: theme.id });

    expect(await createEvent({ ...BASE, market: "JP", themeId })).toBe(
      "対象は市場・テーマ・銘柄のどれか1つを選ぶ",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("市場がJP・US・GLOBALのどれでもないとエラー文が返る", async () => {
    expect(await createEvent({ ...BASE, market: "XX" })).toBe(
      "市場は JP・US・GLOBAL のどれか",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("短縮ラベルが全角5文字を超えるとエラー文が返る", async () => {
    // 「決算発表予定」は全角6文字＝幅12（設計書 §3）
    expect(
      await createEvent({
        ...BASE,
        market: "JP",
        shortLabel: "決算発表予定",
      }),
    ).toBe("短縮ラベルは全角5文字まで");
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("全角5文字ちょうどの短縮ラベルを登録できる", async () => {
    // 幅10。境界を1文字ぶん間違えるとここが落ちる
    expect(
      await createEvent({ ...BASE, market: "JP", shortLabel: "決算発表日" }),
    ).toBeNull();
  });

  it("半角と全角が混じった短縮ラベルを登録できる", async () => {
    // 「7203決算」は6文字だが全角換算では4文字（幅8）。文字数で数えていないことの検証
    expect(
      await createEvent({ ...BASE, market: "JP", shortLabel: "7203決算" }),
    ).toBeNull();
  });

  it("終了日を空にすると単日として登録される", async () => {
    expect(
      await createEvent({ ...BASE, market: "JP", endDate: null }),
    ).toBeNull();

    expect((await onlyEvent()).endDate).toBeNull();
  });

  it("終了日が開始日と同じだとエラー文が返る", async () => {
    // 単日は end_date IS NULL でのみ表す（全体設計書 §4.2）
    expect(
      await createEvent({
        ...BASE,
        market: "JP",
        endDate: BASE.startDate,
      }),
    ).toBe("終了日は開始日より後にする（単日は空のまま）");
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("重要度が1〜3の外だとエラー文が返る", async () => {
    expect(await createEvent({ ...BASE, market: "JP", importance: 4 })).toBe(
      "重要度は1〜3",
    );
    expect(await db.select().from(event)).toHaveLength(0);
  });
});
