import { describe, expect, it } from "vitest";
import { decodeStatSchedule, toStatEvents } from "./stat-schedule";

/** 実物と同じ形の class_2。公表日時は class_5 の中に入っている */
function entry(period: string, date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return `      <class_2 name="${period}">
        <class_3 name=""><class_4 name=""><class_5 name="">
          <release_year>${year}</release_year>
          <release_month>${month}</release_month>
          <release_day>${day}</release_day>
          <release_hour>${hour}</release_hour>
          <release_minute>${minute}</release_minute>
        </class_5></class_4></class_3>
      </class_2>`;
}

/**
 * 実物の公表予定 XML から取った入れ子（Issue #64）。**実物と同じ形にしてある。**
 *
 * - 区分が2つある。1つだけだと、class_1 の取り出しを最短一致から最長一致に
 *   変えても赤くならない（東京都区部の月次が全国に混ざるのに気づけない）
 * - 全国の月次が2件ある。1件だけだと、class_2 の取り出しを最長一致に変えても
 *   赤くならない（2件目以降が黙って落ちるのに気づけない）
 * - 「2025年平均」が混ざっている。月次だけの入力では、月次の判定を外しても赤くならない
 */
const XML = `<e-stat>
  <os_code id="00200573" name="消費者物価指数">
    <class_1 name="全国">
${entry("2026年1月分", "2026-02-20", "8:30")}
${entry("2025年平均", "2026-01-23", "8:30")}
${entry("2026年2月分", "2026-03-24", "8:30")}
    </class_1>
    <class_1 name="東京都区部（中旬速報値）">
${entry("2026年1月分", "2026-01-30", "8:30")}
    </class_1>
  </os_code>
</e-stat>`;

describe("toStatEvents", () => {
  it("全国の月次だけがイベントになる", () => {
    const events = toStatEvents(XML);

    // 東京都区部の 2026-01-30 が混ざらず、全国の2件が両方そろう
    expect(events.map((e) => e.startDate)).toEqual([
      "2026-02-20",
      "2026-03-24",
    ]);
    expect(events[0]).toEqual({
      title: "消費者物価指数（2026年1月分）",
      shortLabel: "日本CPI",
      startDate: "2026-02-20",
      endDate: null,
      time: "08:30",
      importance: 2,
      note: null,
      sourceUrl: "https://www.stat.go.jp/data/cpi/",
      sourceName: "総務省統計局",
      market: "JP",
      themeId: null,
      stockId: null,
    });
    expect(events[1].title).toBe("消費者物価指数（2026年2月分）");
  });

  it("月次でない対象期はどれも入らない", () => {
    // 実物に出てくる4つ。名前の形が違うだけで、中身は月次と同じ入れ子になっている
    const periods = [
      "2025年平均",
      "2025年度平均",
      "2026年平均",
      // 統計の名前をそのまま写している。言い換えると出典の名前と合わなくなる。jargon-ok
      "2025年基準による指数　遡及結果（2025年1月分～2026年6月分）及び接続指数",
    ];
    const xml = `<e-stat><class_1 name="全国">${periods
      .map(
        (period) => `<class_2 name="${period}">
          <class_5 name=""><release_year>2026</release_year><release_month>1</release_month>
          <release_day>23</release_day><release_hour>8</release_hour>
          <release_minute>30</release_minute></class_5>
        </class_2>`,
      )
      .join("")}</class_1></e-stat>`;

    expect(toStatEvents(xml)).toEqual([]);
  });

  it("全国が1つも無ければ何も入らない", () => {
    const xml = XML.replaceAll('class_1 name="全国"', 'class_1 name="沖縄県"');

    expect(toStatEvents(xml)).toEqual([]);
  });

  it("1桁の月・日・時は2桁になる", () => {
    // 実物は <release_month>2</release_month> のように0詰めされていない。
    // そのままつなぐと "2026-2-20" になり、date 列に入っても表示が揃わない
    const events = toStatEvents(XML);

    expect(events[0].startDate).toBe("2026-02-20");
    expect(events[0].time).toBe("08:30");
  });

  it("公表日時が欠けている対象期があると落ちる", () => {
    // 飛ばすと、公表予定に載っているのに登録されない回が黙って出る
    const xml = XML.replace("<release_day>20</release_day>", "");

    expect(() => toStatEvents(xml)).toThrow("公表日時の day が読めない");
  });
});

/** 実物と同じ形（BOM 付き UTF-16LE）のバイト列にする */
function toUtf16Le(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  // BOM（FF FE）に続けて、1文字を下位バイト・上位バイトの順に並べる
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = code >> 8;
  }
  return bytes;
}

describe("decodeStatSchedule", () => {
  it("UTF-16LE のバイト列を読むとイベントが作れる文字列になる", () => {
    // UTF-8 として読むと1文字も合わず、イベントが1件も取れない（設計書 §2.1）
    const decoded = decodeStatSchedule(toUtf16Le(XML));

    expect(decoded.startsWith("<e-stat>")).toBe(true);
    expect(toStatEvents(decoded)).toHaveLength(2);
  });

  it("BOM が無いバイト列は落とす", () => {
    // 文字コードが変わったのに読み進めると、中身が壊れたまま月次0件で成功する
    const utf8 = new TextEncoder().encode(XML);

    expect(() => decodeStatSchedule(utf8)).toThrow("UTF-16LE ではない");
  });
});
