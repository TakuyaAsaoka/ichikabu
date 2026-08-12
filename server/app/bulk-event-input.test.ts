import { describe, expect, it } from "vitest";
import { type Lookup, toEventInputs } from "./bulk-event-input";

/** 対応表。テストで使う銘柄とテーマだけを入れる */
const LOOKUP: Lookup = {
  stocks: [
    { id: 1, market: "JP", ticker: "7203" },
    { id: 2, market: "US", ticker: "AAPL" },
  ],
  themes: [{ id: 5, name: "半導体" }],
};

/** 貼り付ける1行を組み立てる。列は10個（設計書 §2） */
function rowOf(columns: Partial<Record<number, string>> = {}): string {
  const defaults = [
    "米消費者物価指数（2026年7月分）",
    "米CPI",
    "market:GLOBAL",
    "2026-08-12",
    "",
    "21:30",
    "2",
    "米東部時間 8:30 の公表を日本時間に直した時刻",
    "https://www.bls.gov/schedule/news_release/cpi.htm",
    "U.S. Bureau of Labor Statistics",
  ];
  return defaults.map((value, index) => columns[index] ?? value).join("\t");
}

describe("toEventInputs", () => {
  it("市場のイベントと銘柄のイベントを1回で読める", () => {
    // Issue #60 の「あるべき姿の出力」。値は src/db/seed-event.ts に手で入っているもの
    const text = [
      rowOf(),
      [
        "トヨタ自動車 2027年3月期 第1四半期決算",
        "7203決算",
        "stock:JP:7203",
        "2026-08-04",
        "",
        "",
        "3",
        "",
        "https://global.toyota/pages/global_toyota/ir/financial-results/2027_1q_summary_jp.pdf",
        "",
      ].join("\t"),
    ].join("\n");

    const inputs = toEventInputs(text, LOOKUP);

    expect(inputs).toEqual([
      {
        title: "米消費者物価指数（2026年7月分）",
        shortLabel: "米CPI",
        market: "GLOBAL",
        themeId: null,
        stockId: null,
        startDate: "2026-08-12",
        endDate: null,
        time: "21:30",
        importance: 2,
        note: "米東部時間 8:30 の公表を日本時間に直した時刻",
        sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
        sourceName: "U.S. Bureau of Labor Statistics",
      },
      {
        title: "トヨタ自動車 2027年3月期 第1四半期決算",
        shortLabel: "7203決算",
        market: null,
        themeId: null,
        stockId: 1,
        startDate: "2026-08-04",
        endDate: null,
        time: null,
        importance: 3,
        note: null,
        sourceUrl:
          "https://global.toyota/pages/global_toyota/ir/financial-results/2027_1q_summary_jp.pdf",
        sourceName: null,
      },
    ]);
  });

  it("テーマ名で対象を指定できる", () => {
    const inputs = toEventInputs(rowOf({ 2: "theme:半導体" }), LOOKUP);

    expect(inputs).toEqual([
      expect.objectContaining({ themeId: 5, market: null, stockId: null }),
    ]);
  });

  it("同じティッカーでも市場が違えば別の銘柄として引く", () => {
    // stock の一意の制約は (market, ticker) の組（設計書 §3）
    const inputs = toEventInputs(rowOf({ 2: "stock:US:AAPL" }), LOOKUP);

    expect(inputs).toEqual([expect.objectContaining({ stockId: 2 })]);
  });

  it("空白だけの行は飛ばす", () => {
    // 貼り付けの末尾には改行が入る
    const inputs = toEventInputs(`${rowOf()}\n\n  \n`, LOOKUP);

    expect(inputs).toHaveLength(1);
  });

  it("改行コードが CRLF でも読める", () => {
    const inputs = toEventInputs(`${rowOf()}\r\n${rowOf()}\r\n`, LOOKUP);

    expect(inputs).toHaveLength(2);
  });

  it("列が10個ない行はエラー文が返る", () => {
    const inputs = toEventInputs(`${rowOf()}\n名称\t短縮\tmarket:JP`, LOOKUP);

    expect(inputs).toBe("2行目: 列が10個ない（3個）");
  });

  it("登録されていないティッカーはエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "stock:JP:9999" }), LOOKUP);

    expect(inputs).toBe("1行目: その銘柄は無い");
  });

  it("登録されていないテーマ名はエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "theme:海運" }), LOOKUP);

    expect(inputs).toBe("1行目: そのテーマは無い");
  });

  it("market・stock・theme のどれでもない対象はエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "sector:半導体" }), LOOKUP);

    expect(inputs).toBe(
      "1行目: 対象は market: / stock: / theme: のどれかで始める",
    );
  });

  it("コロンが無い対象はエラー文が返る", () => {
    const inputs = toEventInputs(rowOf({ 2: "GLOBAL" }), LOOKUP);

    expect(inputs).toBe(
      "1行目: 対象は market: / stock: / theme: のどれかで始める",
    );
  });

  it("読める行が1つも無ければエラー文が返る", () => {
    expect(toEventInputs("  \n\n", LOOKUP)).toBe("登録する行がない");
  });

  it("空欄の終了日・時刻・補足・出典は null になる", () => {
    // "" のまま date・time 列に入れると型変換エラーで500になる（設計書 §2）
    const inputs = toEventInputs(
      rowOf({ 4: "", 5: "", 7: "", 8: "", 9: "" }),
      LOOKUP,
    );

    expect(inputs).toEqual([
      expect.objectContaining({
        endDate: null,
        time: null,
        note: null,
        sourceUrl: null,
        sourceName: null,
      }),
    ]);
  });

  it("各列の前後の空白は落ちる", () => {
    const inputs = toEventInputs(
      rowOf({ 0: " 米CPIの名称 ", 2: " market:JP " }),
      LOOKUP,
    );

    expect(inputs).toEqual([
      expect.objectContaining({ title: "米CPIの名称", market: "JP" }),
    ]);
  });
});
