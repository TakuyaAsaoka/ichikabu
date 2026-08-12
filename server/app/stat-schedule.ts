import type { EventInput } from "../src/db/write";

// "use server" を付けない素のモジュールにしてある。app/actions.ts は next/headers を
// 使うため Vitest から読み込めず、ここに置いた変換だけがテストできる
// （app/bulk-event-input.ts と同じ理由）

/** 消費者物価指数の公表予定（設計書 §2） */
const SCHEDULE_URL = "https://www.stat.go.jp/data/kouhyou/e-stat_cpi.xml";

/**
 * 登録するイベントの、公表回によらない値（設計書 §1）。
 *
 * 対象は `JP`。米CPI を `GLOBAL` にしているのは日本株にも効くからで
 * （src/db/seed-event.ts）、日本のCPI は米国株の保有者には効かない。
 * 出典の名前とURLは、全体設計書 §2.1 の条件4を満たすために入れる
 */
const COMMON = {
  shortLabel: "日本CPI",
  importance: 2,
  market: "JP",
  endDate: null,
  note: null,
  themeId: null,
  stockId: null,
  sourceName: "総務省統計局",
  sourceUrl: "https://www.stat.go.jp/data/cpi/",
} as const satisfies Partial<EventInput>;

/** 統計名。名称の前に付ける。この XML は消費者物価指数のものだけを読む（設計書 §1 #4） */
const STATISTIC_NAME = "消費者物価指数";

/** 使う区分。東京都区部（中旬速報値）は入れない（設計書 §1 #3） */
const AREA = "全国";

// 以下の正規表現は、総務省が機械で作っているこの XML の形に合わせたもの。
// class_3・class_4・class_5 は name が空のまま入れ子になっているだけなので、
// class_2 の中身をそのまま次の正規表現に渡せば飛ばせる。
// **属性が増えたり <![CDATA[ が入ったりすると壊れる。** そうなったら
// XML パーサのライブラリを足す（設計書 §2.2）
const CLASS_1 = /<class_1\s+name="([^"]*)">([\s\S]*?)<\/class_1>/g;
const CLASS_2 = /<class_2\s+name="([^"]*)">([\s\S]*?)<\/class_2>/g;

/** 対象期が月次かどうか。年平均・年度平均・接続指数はこの形にならない（設計書 §2.3） */
const MONTHLY = /^\d{4}年\d{1,2}月分$/;

/** 公表日時の各タグ。値は class_2 の中の class_5 に入っている */
const RELEASE = {
  year: /<release_year>(\d+)<\/release_year>/,
  month: /<release_month>(\d+)<\/release_month>/,
  day: /<release_day>(\d+)<\/release_day>/,
  hour: /<release_hour>(\d+)<\/release_hour>/,
  minute: /<release_minute>(\d+)<\/release_minute>/,
} as const;

/**
 * 公表日時の1つを2桁の文字列で取り出す。
 *
 * 見つからなければ落とす。飛ばすと、公表予定に載っているのに登録されない回が
 * 黙って出る（src/db/seed-event.ts の「銘柄が見つからない」と同じ考え方）
 */
function release(entry: string, key: keyof typeof RELEASE, period: string) {
  const found = entry.match(RELEASE[key]);
  if (!found) {
    throw new Error(`公表日時の ${key} が読めない: ${period}`);
  }
  return found[1].padStart(2, "0");
}

/**
 * 公表予定 XML を EventInput の並びにする。全国の月次だけを返す（設計書 §2）。
 *
 * 公表日時は日本時間そのまま。FOMC・米CPI のような時差の換算は要らない
 * （全体設計書 §4.1 は日付・時刻を日本時間で入れると決めている）
 */
export function toStatEvents(xml: string): EventInput[] {
  const events: EventInput[] = [];
  for (const [, area, areaBody] of xml.matchAll(CLASS_1)) {
    if (area !== AREA) {
      continue;
    }
    for (const [, period, entry] of areaBody.matchAll(CLASS_2)) {
      if (!MONTHLY.test(period)) {
        continue;
      }
      const at = (key: keyof typeof RELEASE) => release(entry, key, period);
      events.push({
        ...COMMON,
        title: `${STATISTIC_NAME}（${period}）`,
        startDate: `${at("year")}-${at("month")}-${at("day")}`,
        time: `${at("hour")}:${at("minute")}`,
      });
    }
  }
  return events;
}

/**
 * 公表予定 XML のバイト列を文字列にする（設計書 §2.1）。
 *
 * UTF-16LE で配信されている。`curl` で落として `iconv` で UTF-8 に直す手は
 * 使えない。宣言が `UTF-16` のまま残るため XML として読めなくなる。
 *
 * 先頭の BOM を確かめてから読む。文字コードが変わったのに UTF-16LE として
 * 読むと、中身が壊れたまま「月次0件」で成功してしまう
 */
export function decodeStatSchedule(bytes: Uint8Array): string {
  if (bytes[0] !== 0xff || bytes[1] !== 0xfe) {
    throw new Error("公表予定が UTF-16LE ではない（配信の形が変わった可能性）");
  }
  // BOM は TextDecoder が落とす
  return new TextDecoder("utf-16le").decode(bytes);
}

/** 公表予定 XML を取って文字列にする */
export async function fetchStatSchedule(): Promise<string> {
  // 相手が黙ったときに手で実行したまま固まらないよう、待つ時間に上限を置く
  const response = await fetch(SCHEDULE_URL, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`公表予定を取得できない: HTTP ${response.status}`);
  }
  return decodeStatSchedule(new Uint8Array(await response.arrayBuffer()));
}
