import type { EventInput } from "../src/db/write";

// "use server" を付けない素のモジュールにしてある。app/actions.ts は next/headers を
// 使うため Vitest から読み込めず、ここに置いた変換だけがテストできる
// （イベント登録フォーム設計書 §5。app/event-input.ts と同じ理由）

/** ティッカー・テーマ名からIDを引くための対応表（設計書 §3） */
export type Lookup = {
  stocks: { id: number; market: string; ticker: string }[];
  themes: { id: number; name: string }[];
};

/** 貼り付ける1行の列数（設計書 §2） */
const COLUMNS = 10;

/**
 * 空欄を null に読み替える。1件ずつのフォーム（app/event-input.ts の toNullable）と
 * 同じ規則。"" のまま date・time 列に入れると、制約違反ではない型変換エラーで
 * 500 になる
 */
function toNullable(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/** 対象の3列。ちょうど1つだけが埋まる（全体設計書 §4.2） */
type Target = {
  market: string | null;
  themeId: number | null;
  stockId: number | null;
};

/**
 * 対象の書き方（"market:GLOBAL" / "stock:JP:7203" / "theme:半導体"）を
 * event の3列に振り分ける。引けなければ日本語のエラー文を返す（設計書 §3）。
 *
 * 銘柄は市場とティッカーの2つで引く。stock の一意の制約は (market, ticker) の
 * 組で、ティッカーだけでは1件に定まらない
 */
function toTarget(value: string, lookup: Lookup): Target | string {
  // 最初のコロンだけで分ける。テーマ名にコロンが入っても読めるようにするため
  const separator = value.indexOf(":");
  if (separator === -1) {
    // コロンが無いと slice(0, -1) で最後の1文字が落ち、"market1" のような値が
    // "market" 分岐に紛れ込んでしまう。ここで弾く
    return "対象は market: / stock: / theme: のどれかで始める";
  }
  const kind = value.slice(0, separator);
  const rest = value.slice(separator + 1);

  if (kind === "market") {
    // market の値は絞り込まず、生のまま DB の event_market_check に判定させる
    // （src/db/write.ts の eventValues と同じ方針）
    return { market: rest, themeId: null, stockId: null };
  }
  if (kind === "stock") {
    const [market, ticker] = rest.split(":");
    const found = lookup.stocks.find(
      (row) => row.market === market && row.ticker === ticker,
    );
    return found
      ? { market: null, themeId: null, stockId: found.id }
      : "その銘柄は無い";
  }
  if (kind === "theme") {
    const found = lookup.themes.find((row) => row.name === rest);
    return found
      ? { market: null, themeId: found.id, stockId: null }
      : "そのテーマは無い";
  }
  return "対象は market: / stock: / theme: のどれかで始める";
}

/** 貼り付けた1行を EventInput にする。読めなければ日本語のエラー文を返す */
function toInput(line: string, lookup: Lookup): EventInput | string {
  const columns = line.split("\t");
  if (columns.length !== COLUMNS) {
    return `列は${COLUMNS}個にする（${columns.length}個ある）`;
  }

  // 名称・短縮ラベル・開始日は notNull だが空文字を弾く CHECK が無い。1件ずつの
  // フォームは <input required> で弾いているが、貼り付け経路には無いためここで弾く
  // （src/db/write.ts の createTheme と同じ考え方）
  const title = columns[0].trim();
  if (title === "") {
    return "名称を入れる";
  }
  const shortLabel = columns[1].trim();
  if (shortLabel === "") {
    return "短縮ラベルを入れる";
  }

  const target = toTarget(columns[2].trim(), lookup);
  if (typeof target === "string") {
    return target;
  }

  const startDate = columns[3].trim();
  if (startDate === "") {
    return "開始日を入れる";
  }

  return {
    title,
    shortLabel,
    startDate,
    endDate: toNullable(columns[4]),
    time: toNullable(columns[5]),
    importance: Number(columns[6]),
    note: toNullable(columns[7]),
    sourceUrl: toNullable(columns[8]),
    sourceName: toNullable(columns[9]),
    ...target,
  };
}

/**
 * 貼り付けた文字列を createEvents の入力にする。
 * 読めない行があれば、行番号を付けた日本語のエラー文を返す（設計書 §4）。
 *
 * 行番号は貼り付けた行の番号のまま。落とすのは末尾の空行だけで、途中の空行は
 * そのまま列数のエラーにする。全部飛ばすと、途中に空行が1つでもあるだけで
 * 以降の行番号が実物より小さくなり、運用者がエラーと違う行を見にいくことになる
 */
export function toEventInputs(
  text: string,
  lookup: Lookup,
): EventInput[] | string {
  // 行全体は trim しない。末尾の列が空の行から末尾のタブが消えて列数が変わる
  const lines = text.split(/\r?\n/);
  // 末尾の空行だけを落とす。貼り付けの末尾に改行が入るため
  while (lines.at(-1)?.trim() === "") lines.pop();
  if (lines.length === 0) {
    return "登録する行がない";
  }

  const inputs: EventInput[] = [];
  for (const [index, line] of lines.entries()) {
    const input = toInput(line, lookup);
    if (typeof input === "string") {
      return `${index + 1}行目: ${input}`;
    }
    inputs.push(input);
  }
  return inputs;
}
