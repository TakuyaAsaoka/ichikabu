import type { EventInput } from "../src/db/write";

// "use server" を付けない素のモジュールにしてある。app/actions.ts は next/headers を
// 使うため Vitest から読み込めず、ここに置いた変換だけがテストできる
// （app/bulk-event-input.ts と同じ理由）

/** 消費者物価指数の公表予定 */
const SCHEDULE_URL = "https://www.stat.go.jp/data/kouhyou/e-stat_cpi.xml";

/**
 * 登録するイベントの、公表回によらない値（#64）。
 *
 * 対象は `JP`。米CPI を `GLOBAL` にしているのは日本株にも効くからで
 * （src/db/seed-event.ts）、日本のCPI は米国株の保有者には効かない。
 * 出典の名前とURLを入れる。公表予定を取り込んでよいのは、出典の条件が
 * `source_name` と `source_url` の2つを埋めるだけで満たせる出典に限っている
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

/**
 * 統計名。名称の前に付ける。この XML は消費者物価指数のものだけを読む。
 * 統計局が配信する他の9本は中身を確かめていない
 */
const STATISTIC_NAME = "消費者物価指数";

/**
 * 使う区分。東京都区部（中旬速報値）は入れない。株式市場に効くのは全国のほうで、
 * 合わせると年24件になり、カレンダーの1日2件の枠を食う
 */
const AREA = "全国";

// 以下の正規表現は、総務省が機械で作っているこの XML の形に合わせたもの。
// class_3・class_4・class_5 は name が空のまま入れ子になっているだけなので、
// class_2 の中身をそのまま次の正規表現に渡せば飛ばせる。
// **属性が増えたり <![CDATA[ が入ったりすると壊れる。** そうなったら
// XML パーサのライブラリを足す
const CLASS_1 = /<class_1\s+name="([^"]*)">([\s\S]*?)<\/class_1>/g;
const CLASS_2 = /<class_2\s+name="([^"]*)">([\s\S]*?)<\/class_2>/g;

/** 月次の対象期の形。下の名称の形と共通の部品にするため、文字列で持つ */
const MONTHLY_SHAPE = "[0-9]{4}年[0-9]{1,2}月分";

/** 対象期が月次かどうか。年平均・年度平均・接続指数はこの形にならない */
const MONTHLY = new RegExp(`^${MONTHLY_SHAPE}$`);

/**
 * 取り込みが名づける名称の形（#72）。
 * **この形の名称の行は取り込みのもの**とみなし、公表予定に無くなれば非アクティブにする。
 *
 * 下の `toStatEvents` が作る名称と同じ2つの部品から組み立てている。統計名や
 * 対象期の形を変えれば、この形も一緒に変わる。2箇所に書き写さない。
 *
 * PostgreSQL の正規表現としてそのまま渡す。**統計名に正規表現の記号
 * （`.` `(` `|` 等）を入れてはならない。** ここは記号を打ち消さずに埋め込むため、
 * 入れると意図より広い範囲に当たり、公表される回まで非アクティブになる
 */
export const STAT_TITLE_PATTERN = `^${STATISTIC_NAME}（${MONTHLY_SHAPE}）$`;

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
 * 公表予定 XML を EventInput の並びにする。全国の月次だけを返す。
 *
 * 公表日時は日本時間そのまま。FOMC・米CPI のような時差の換算は要らない
 * （イベントの日付・時刻は日本時間で入れる決まり）
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
 * 公表予定 XML のバイト列を文字列にする。
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
