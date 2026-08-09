import { describe, expect, it } from "vitest";
import { toEventInput } from "./event-input";

/** ブラウザが送る形の FormData を作る。空欄は "" で入る */
function formOf(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields = {
    title: "日本銀行 金融政策決定会合",
    shortLabel: "日銀会合",
    target: "market:JP",
    startDate: "2026-09-18",
    endDate: "",
    time: "",
    importance: "2",
    note: "",
    sourceUrl: "",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  return form;
}

describe("toEventInput", () => {
  it("空欄の終了日・時刻・補足・出典URLはnullになる", () => {
    // "" のまま date・time 列に入れると型変換エラーで500になる（設計書 §5）
    const input = toEventInput(formOf());

    expect(input.endDate).toBeNull();
    expect(input.time).toBeNull();
    expect(input.note).toBeNull();
    expect(input.sourceUrl).toBeNull();
  });

  it("入力された終了日・時刻・補足・出典URLはそのまま入る", () => {
    const input = toEventInput(
      formOf({
        endDate: "2026-09-19",
        time: "12:30",
        note: "1日目は展望レポートなし",
        sourceUrl: "https://www.boj.or.jp/",
      }),
    );

    expect(input.endDate).toBe("2026-09-19");
    expect(input.time).toBe("12:30");
    expect(input.note).toBe("1日目は展望レポートなし");
    expect(input.sourceUrl).toBe("https://www.boj.or.jp/");
  });

  it("市場を選ぶとmarketだけに値が入る", () => {
    const input = toEventInput(formOf({ target: "market:GLOBAL" }));

    expect(input.market).toBe("GLOBAL");
    expect(input.themeId).toBeNull();
    expect(input.stockId).toBeNull();
  });

  it("テーマを選ぶとthemeIdだけに値が入る", () => {
    const input = toEventInput(formOf({ target: "theme:12" }));

    expect(input.themeId).toBe(12);
    expect(input.market).toBeNull();
    expect(input.stockId).toBeNull();
  });

  it("銘柄を選ぶとstockIdだけに値が入る", () => {
    const input = toEventInput(formOf({ target: "stock:3" }));

    expect(input.stockId).toBe(3);
    expect(input.market).toBeNull();
    expect(input.themeId).toBeNull();
  });

  it("対象が未選択だと3列とも null になる", () => {
    // DB の event_target_exclusive_check が弾く形になっていることの確認（設計書 §4）
    const input = toEventInput(formOf({ target: "" }));

    expect(input.market).toBeNull();
    expect(input.themeId).toBeNull();
    expect(input.stockId).toBeNull();
  });

  it("名称・短縮ラベル・開始日・重要度がそのまま入る", () => {
    const input = toEventInput(formOf({ importance: "3" }));

    expect(input.title).toBe("日本銀行 金融政策決定会合");
    expect(input.shortLabel).toBe("日銀会合");
    expect(input.startDate).toBe("2026-09-18");
    expect(input.importance).toBe(3);
  });
});
