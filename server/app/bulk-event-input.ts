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
    return `列が${COLUMNS}個ない（${columns.length}個）`;
  }

  const target = toTarget(columns[2].trim(), lookup);
  if (typeof target === "string") {
    return target;
  }

  return {
    title: columns[0].trim(),
    shortLabel: columns[1].trim(),
    startDate: columns[3].trim(),
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
 * 行番号は空白だけの行を除いたあとの番号。貼り付けの末尾には改行が入るため、
 * 空行を数に入れると最後の行の番号が実物とずれる
 */
export function toEventInputs(
  text: string,
  lookup: Lookup,
): EventInput[] | string {
  // 行全体は trim しない。末尾の列が空の行から末尾のタブが消えて列数が変わる
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
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
