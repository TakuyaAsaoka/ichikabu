import { describe, expect, it } from "vitest";
import { CLOSED_DAYS, RIGHTS_YEARS, rightsDates } from "./rights";

describe("権利日の計算", () => {
  it("月末が営業日ならその日が権利確定日になる（2026年3月決算）", () => {
    // 3/31 は火曜で営業日。そこから遡って 3/30(月)・3/27(金)
    expect(rightsDates(2026, 3)).toEqual({
      recordDate: "2026-03-31",
      exDate: "2026-03-30",
      lastDate: "2026-03-27",
    });
  });

  it("証券会社の公表値と一致する（2025年3月決算）", () => {
    // 2025年3月の権利付最終日として各社が公表している日付
    expect(rightsDates(2025, 3)).toEqual({
      recordDate: "2025-03-31",
      exDate: "2025-03-28",
      lastDate: "2025-03-27",
    });
  });

  it("12月31日が休場なので権利確定日が12月30日になる（2025年12月決算）", () => {
    expect(rightsDates(2025, 12)).toEqual({
      recordDate: "2025-12-30",
      exDate: "2025-12-29",
      lastDate: "2025-12-26",
    });
  });

  it("遡る途中に祝日が挟まると営業日の数え方が変わる（2025年4月決算）", () => {
    // 4/30(水) から遡ると 4/29 は昭和の日。土日だけを見て数えると 4/28 になるが、
    // 祝日を休みに数えると 4/25(金) になる。休場日リストが効いていることはここでしか固定できない
    expect(rightsDates(2025, 4)).toEqual({
      recordDate: "2025-04-30",
      exDate: "2025-04-28",
      lastDate: "2025-04-25",
    });
  });

  it("月末が土曜なら権利確定日が前営業日になる（2026年1月決算）", () => {
    expect(rightsDates(2026, 1)).toEqual({
      recordDate: "2026-01-30",
      exDate: "2026-01-29",
      lastDate: "2026-01-28",
    });
  });

  it("休場日リストに無い年は計算しない", () => {
    // 祝日が未確定の年を推測で埋めると、間違った日付を計算結果として出すことになる
    expect(rightsDates(2030, 3)).toBeNull();
  });

  it("計算できる年には平日の休場日が15件以上ある", () => {
    // 計算できる年はリストに載っている年から導いているので、ある年の日付が
    // 1件でもあればその年は計算対象になる。翌年ぶんの貼り付けが途中で止まると、
    // その年だけ祝日を無視した日付を静かに返す。件数で止める。
    // 国民の祝日は年16〜19件あり、土日に当たったぶんを除いても15件を下回らない
    for (const year of RIGHTS_YEARS) {
      const days = CLOSED_DAYS.filter((day) => day.startsWith(`${year}-`));
      expect(days.length, `${year}年の休場日`).toBeGreaterThanOrEqual(15);
    }
  });
});
