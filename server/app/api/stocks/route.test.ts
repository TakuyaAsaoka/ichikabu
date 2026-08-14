import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/db";
import { stock, theme, themeStock } from "../../../src/db/schema";
import type { components } from "../../../src/generated/api";
import { resetDatabase } from "../../../test/helpers";
import { GET } from "./route";

type Stock = components["schemas"]["Stock"];

/** ハンドラを呼び、200 を確かめて本文の配列を返す */
async function fetchStocks(): Promise<Stock[]> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(resetDatabase);

describe("GET /api/stocks", () => {
  it("銘柄が無ければ 200 で空配列を返す", async () => {
    expect(await fetchStocks()).toEqual([]);
  });

  it("認証なしで銘柄一覧が返り、市場・ティッカーの昇順に並ぶ", async () => {
    // 認証は要らない（ログイン廃止 設計書 §3.2）。トークンを渡さずに呼べる
    await db.insert(stock).values([
      { market: "US", ticker: "NVDA", name: "NVIDIA" },
      { market: "JP", ticker: "7203", name: "トヨタ自動車" },
      { market: "JP", ticker: "6758", name: "ソニーグループ" },
    ]);

    expect((await fetchStocks()).map((s) => [s.market, s.ticker])).toEqual([
      ["JP", "6758"],
      ["JP", "7203"],
      ["US", "NVDA"],
    ]);
  });

  it("所属テーマが themeIds に入り、属していない銘柄は空になる", async () => {
    const [nvidia] = await db
      .insert(stock)
      .values({ market: "US", ticker: "NVDA", name: "NVIDIA" })
      .returning();
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    const [semiconductor] = await db
      .insert(theme)
      .values({ name: "半導体" })
      .returning();
    const [ai] = await db.insert(theme).values({ name: "AI" }).returning();
    await db.insert(themeStock).values([
      { themeId: semiconductor.id, stockId: nvidia.id },
      { themeId: ai.id, stockId: nvidia.id },
    ]);

    // 端末はこの一覧から「持っている銘柄が覆うテーマ」を作り、
    // テーマイベントを出すかどうかを決める（ログイン廃止 設計書 §3.1）
    // 並び順は契約で決めていないので、比べる前に揃える
    const ascending = (a: number, b: number): number => a - b;
    const stocks = await fetchStocks();
    expect(stocks.map((s) => [s.id, [...s.themeIds].sort(ascending)])).toEqual([
      [toyota.id, []],
      [nvidia.id, [ai.id, semiconductor.id].sort(ascending)],
    ]);
  });

  it("決算月は返さず、欄は id・市場・ティッカー・銘柄名・所属テーマの5つになる", async () => {
    const [toyota] = await db
      .insert(stock)
      .values({
        market: "JP",
        ticker: "7203",
        name: "トヨタ自動車",
        fiscalMonth: 3,
      })
      .returning();

    // 決算月は返さない。権利日はサーバーが計算して返すため端末に使い道が無い
    expect(await fetchStocks()).toEqual([
      {
        id: toyota.id,
        market: "JP",
        ticker: "7203",
        name: "トヨタ自動車",
        themeIds: [],
      },
    ]);
  });
});
