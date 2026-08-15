import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test/helpers";
import { db } from "./db";
import { event, stock } from "./db/schema";
import { RIGHTS_YEARS } from "./rights";
import { findGaps, type GapKind, jstToday } from "./status";

beforeEach(resetDatabase);

/** 休場日リストが足りている日。翌年ぶんが載っている年のうち */
const LAST_YEAR = RIGHTS_YEARS[RIGHTS_YEARS.length - 1];
const TODAY = `${LAST_YEAR - 1}-06-01`;

/** 銘柄を1件入れてIDを返す */
async function addStock(
  values: Partial<typeof stock.$inferInsert> = {},
): Promise<number> {
  const [row] = await db
    .insert(stock)
    .values({
      market: "JP",
      ticker: "7203",
      name: "トヨタ自動車",
      fiscalMonth: 3,
      ...values,
    })
    .returning({ id: stock.id });
  return row.id;
}

/** イベントを1件入れる */
async function addEvent(
  values: Partial<typeof event.$inferInsert> = {},
): Promise<void> {
  await db.insert(event).values({
    title: "決算発表",
    shortLabel: "決算",
    startDate: `${LAST_YEAR}-05-01`,
    importance: 2,
    market: "JP",
    ...values,
  });
}

/** その種類の抜けの行だけを取り出す */
async function gapsOf(kind: GapKind, today = TODAY): Promise<string[]> {
  const gaps = await findGaps(today);
  return gaps.filter((gap) => gap.kind === kind).map((gap) => gap.label);
}

describe("次の決算日が未登録", () => {
  it("今日以降のイベントが無い銘柄が出る", async () => {
    const id = await addStock();
    // 過ぎたイベントしか無い銘柄は「次の決算日」が埋まっていない
    await addEvent({ market: null, stockId: id, startDate: `${TODAY}` });
    await addEvent({
      market: null,
      stockId: id,
      startDate: `${LAST_YEAR - 2}-05-01`,
    });

    expect(await gapsOf("nextEarnings", `${LAST_YEAR - 1}-06-02`)).toEqual([
      "JP 7203 トヨタ自動車",
    ]);
  });

  it("今日以降のイベントがある銘柄は出ない", async () => {
    const id = await addStock();
    // 今日ちょうどの回も「次の決算日」に数える
    await addEvent({ market: null, stockId: id, startDate: TODAY });

    expect(await gapsOf("nextEarnings")).toEqual([]);
  });

  it("他の銘柄のイベントでは埋まらない", async () => {
    const toyota = await addStock();
    await addStock({ ticker: "6758", name: "ソニーグループ" });
    await addEvent({ market: null, stockId: toyota, startDate: TODAY });

    expect(await gapsOf("nextEarnings")).toEqual(["JP 6758 ソニーグループ"]);
  });
});

describe("決算月なし", () => {
  it("決算月が空のJP銘柄が出る", async () => {
    await addStock({ fiscalMonth: null });

    expect(await gapsOf("fiscalMonth")).toEqual(["JP 7203 トヨタ自動車"]);
  });

  it("決算月が入っていれば出ない。US銘柄は決算月が空でも出ない", async () => {
    await addStock();
    // 決算月はJP銘柄にしか入らない（CHECK 制約 stock_fiscal_month_market_check）。
    // US銘柄まで出すと、直しようのない行が毎回赤く並ぶ
    await addStock({
      market: "US",
      ticker: "AAPL",
      name: "Apple",
      fiscalMonth: null,
    });

    expect(await gapsOf("fiscalMonth")).toEqual([]);
  });
});

describe("出典の表示名なし", () => {
  it("出典URLはあるが表示名が無い行が出る", async () => {
    await addEvent({
      title: "消費者物価指数（2027年1月分）",
      sourceUrl: "https://www.stat.go.jp/data/cpi/",
    });

    expect(await gapsOf("sourceName")).toEqual([
      `${LAST_YEAR}-05-01 消費者物価指数（2027年1月分）`,
    ]);
  });

  it("表示名まで入っている行と、出典を持たない行は出ない", async () => {
    await addEvent({
      sourceUrl: "https://www.stat.go.jp/data/cpi/",
      sourceName: "総務省統計局",
    });
    await addEvent({ title: "出典なし" });

    expect(await gapsOf("sourceName")).toEqual([]);
  });
});

describe("過ぎた非アクティブ", () => {
  it("非アクティブのまま日付が過ぎた行が出る", async () => {
    await addEvent({
      title: "消費者物価指数（2026年1月分）",
      startDate: `${LAST_YEAR - 2}-01-23`,
      active: false,
    });

    expect(await gapsOf("pastInactive")).toEqual([
      `${LAST_YEAR - 2}-01-23 消費者物価指数（2026年1月分）`,
    ]);
  });

  it("過ぎたアクティブな行・これからの非アクティブな行・期間の途中の行は出ない", async () => {
    // 過ぎたアクティブは終わったイベントそのもので、抜けではない。
    // ここを「日付が過ぎているのにアクティブなままの行」で判定すると、
    // 過去のイベント全件が恒久的に赤くなる（開発DBの実測で40件中12件）
    await addEvent({
      title: "終わった決算",
      startDate: `${LAST_YEAR - 2}-05-01`,
    });
    // これからの非アクティブは、中止かどうかがまだ決まっていない
    await addEvent({
      title: "中止かもしれない回",
      startDate: TODAY,
      active: false,
    });
    // 期間のイベントは終わりの日で見る
    await addEvent({
      title: "開催中の展示会",
      startDate: `${LAST_YEAR - 1}-05-30`,
      endDate: `${LAST_YEAR - 1}-06-03`,
      active: false,
    });

    expect(await gapsOf("pastInactive")).toEqual([]);
  });
});

describe("休場日リストの不足", () => {
  it("翌年ぶんが載っていない年に入ると出る", async () => {
    // リストの最後の年に入ると、その年のうちに翌年ぶんが要る（全体設計書 §14）
    expect(await gapsOf("closedDays", `${LAST_YEAR}-01-01`)).toEqual([
      `休場日リストが${LAST_YEAR}年まで。${LAST_YEAR + 1}年ぶんが要る（src/rights.ts の CLOSED_DAYS）`,
    ]);
  });

  it("翌年ぶんが載っていれば出ない", async () => {
    expect(await gapsOf("closedDays", TODAY)).toEqual([]);
  });
});

describe("findGaps", () => {
  it("抜けが1件も無ければ空になる", async () => {
    const id = await addStock();
    await addEvent({ market: null, stockId: id, startDate: TODAY });

    expect(await findGaps(TODAY)).toEqual([]);
  });

  it("直せる画面がある抜けは行き先を持つ", async () => {
    const id = await addStock({ fiscalMonth: null });

    expect(await findGaps(TODAY)).toContainEqual({
      kind: "fiscalMonth",
      label: "JP 7203 トヨタ自動車",
      href: `/stocks/${id}`,
    });
  });
});

describe("jstToday", () => {
  it("日本時間の暦日を返す", () => {
    // UTC で切ると前日の 2026-08-14 になる時刻
    expect(jstToday(new Date("2026-08-14T23:30:00Z"))).toBe("2026-08-15");
  });
});
