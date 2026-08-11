import { eq, sql } from "drizzle-orm";
import { db } from ".";
import { event, holding, stock, theme, themeStock } from "./schema";
import { violatedConstraint } from "./violation";

/**
 * 制約違反を画面に出す日本語にする（設計書 §5）。
 * 制約名は server/drizzle/ のマイグレーションの実物
 */
const MESSAGES: Record<string, string> = {
  stock_market_ticker_unique: "その市場のティッカーは登録済み",
  stock_market_check: "市場は JP か US",
  stock_ticker_check:
    "ティッカーは半角の数字・英大文字・ピリオド・ハイフンだけ使える",
  stock_fiscal_month_market_check: "決算月はJP銘柄にだけ入れられる",
  stock_fiscal_month_check: "決算月は1〜12",
  holding_user_id_stock_id_pk: "その銘柄はすでに保有に登録済み",
  theme_name_unique: "そのテーマ名は登録済み",
  theme_stock_theme_id_stock_id_pk: "その銘柄はすでにこのテーマに登録済み",
  event_target_exclusive_check: "対象は市場・テーマ・銘柄のどれか1つを選ぶ",
  event_period_check: "終了日は開始日より後にする（単日は空のまま）",
  event_importance_check: "重要度は1〜3",
  event_source_name_check: "出典の名前を入れるならURLも入れる",
  event_market_check: "市場は JP・US・GLOBAL のどれか",
};

/**
 * 登録を実行し、上の表にある制約違反なら日本語のエラー文を返す。
 * 表に無いエラーは投げ直す。握りつぶすと、理由が出ないまま失敗する画面になる
 */
async function run(operation: Promise<unknown>): Promise<string | null> {
  try {
    await operation;
  } catch (error) {
    const message = MESSAGES[violatedConstraint(error) ?? ""];
    if (message) {
      return message;
    }
    throw error;
  }
  return null;
}

export type StockInput = {
  /** DB の stock_market_check 制約が正。ここでは絞り込まない */
  market: string;
  ticker: string;
  name: string;
  /** 決算月（1〜12）。JP銘柄のみ。US銘柄では null（全体設計書 §4.1） */
  fiscalMonth: number | null;
};

/** 銘柄を登録する。成功で null、制約違反で日本語のエラー文を返す */
export function createStock(input: StockInput): Promise<string | null> {
  // market 列は Drizzle 上 "JP" | "US" の型だが、StockInput.market は string。
  // as で型を偽らず、sql`` で生の値のまま渡し、DB の stock_market_check に判定させる
  return run(
    db.insert(stock).values({ ...input, market: sql`${input.market}` }),
  );
}

/**
 * 保有を登録する。成功で null、制約違反で日本語のエラー文を返す。
 * userId はセッションから渡す。この関数はセッションを読まない（設計書 §4）
 */
export function createHolding(
  userId: string,
  stockId: number,
): Promise<string | null> {
  return run(db.insert(holding).values({ userId, stockId }));
}

/**
 * テーマを登録する。成功で null、失敗で日本語のエラー文を返す。
 * 前後の空白は落とす。「半導体 」は「半導体」と別の名前として UNIQUE を素通りするが、
 * 画面には見分けが付かない選択肢が2つ並び、消す画面も無い（設計書 §3）
 */
export async function createTheme(name: string): Promise<string | null> {
  const trimmed = name.trim();
  // name は notNull だが空文字を弾く CHECK が無い。空白だけの入力は
  // <input required> を素通りするため、ここで弾く
  if (trimmed === "") {
    return "テーマ名を入れる";
  }
  return run(db.insert(theme).values({ name: trimmed }));
}

/** テーマ所属を登録する。成功で null、制約違反で日本語のエラー文を返す */
export function createThemeStock(
  themeId: number,
  stockId: number,
): Promise<string | null> {
  return run(db.insert(themeStock).values({ themeId, stockId }));
}

export type EventInput = {
  title: string;
  /** カレンダーのセルに出す略号。幅の上限はここで判定する（全体設計書 §14 #10） */
  shortLabel: string;
  startDate: string;
  /** null は単日を表す（全体設計書 §4.2） */
  endDate: string | null;
  /** JST。null は時刻なし */
  time: string | null;
  importance: number;
  note: string | null;
  sourceUrl: string | null;
  /** 画面に出す出典の名前。入れるなら sourceUrl も要る（出典表示設計書 §3.1） */
  sourceName: string | null;
  // 以下3列が対象。ちょうど1つだけ非NULLであることは DB の
  // event_target_exclusive_check が判定する。ここでは絞り込まない（設計書 §4）
  market: string | null;
  themeId: number | null;
  stockId: number | null;
};

/** 短縮ラベルの上限。半角を1・全角を2として数えた幅で、10 は全角5文字ぶん（設計書 §3） */
const SHORT_LABEL_MAX_WIDTH = 10;

/**
 * 短縮ラベルの表示幅を数える。半角が1、全角が2。
 * 半角とみなすのは ASCII の表示文字（空白〜チルダ）と半角カナ
 */
function labelWidth(text: string): number {
  return [...text].reduce((w, c) => w + (/[ -~｡-ﾟ]/.test(c) ? 1 : 2), 0);
}

/**
 * 短縮ラベルの幅を判定し、長すぎれば日本語のエラー文を返す。
 * 短縮ラベルの幅だけは DB に制約が無いためここで判定する（設計書 §3）
 */
function tooLongLabel(shortLabel: string): string | null {
  return labelWidth(shortLabel) > SHORT_LABEL_MAX_WIDTH
    ? "短縮ラベルは全角5文字まで"
    : null;
}

/**
 * イベントの列に入れる値。market は Drizzle 上 "JP" | "US" | "GLOBAL" の型だが、
 * EventInput.market は string | null。as で型を偽らず、生の値のまま渡して
 * DB の event_market_check に判定させる
 */
function eventValues(input: EventInput) {
  return { ...input, market: sql`${input.market}` };
}

/** イベントを登録する。成功で null、失敗で日本語のエラー文を返す */
export async function createEvent(input: EventInput): Promise<string | null> {
  return (
    tooLongLabel(input.shortLabel) ??
    run(db.insert(event).values(eventValues(input)))
  );
}

/**
 * IDが整数でなければ日本語のエラー文を返す。
 * 画面から来る id は文字列で、数字でなければ Number() が NaN になる。
 * NaN を integer 列に渡すと、制約違反ではない型変換エラーで 500 になる（設計書 §6）
 */
function invalidId(id: number): string | null {
  return Number.isInteger(id) ? null : "そのイベントは見つからない";
}

/**
 * イベントを更新する。成功で null、失敗で日本語のエラー文を返す。
 * 該当するIDが無ければ0件更新になり、成功として null を返す
 */
export async function updateEvent(
  id: number,
  input: EventInput,
): Promise<string | null> {
  return (
    invalidId(id) ??
    tooLongLabel(input.shortLabel) ??
    run(db.update(event).set(eventValues(input)).where(eq(event.id, id)))
  );
}

/**
 * イベントを削除する。成功で null、失敗で日本語のエラー文を返す。
 * event は他のテーブルから参照されないため、外部キー違反は起きない（設計書 §3.2）
 */
export async function deleteEvent(id: number): Promise<string | null> {
  return invalidId(id) ?? run(db.delete(event).where(eq(event.id, id)));
}
