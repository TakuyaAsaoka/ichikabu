import { eq, sql } from "drizzle-orm";
import { db } from ".";
import { pgError } from "./pg-error";
import { event, holding, stock, theme, themeStock } from "./schema";

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
  // 存在しないIDを指した外部キー違反。選択肢は画面がDBから出しているため、
  // 画面を通した操作では起きない。Server Action への直接POSTでだけ届く。
  // holding_user_id_user_id_fk は入れない。利用者IDはセッションから来るため
  // 画面からは届かず、サインイン中に利用者が消えた場合にしか出ない（Issue #49）
  event_theme_id_theme_id_fk: "そのテーマは無い",
  event_stock_id_stock_id_fk: "その銘柄は無い",
  holding_stock_id_stock_id_fk: "その銘柄は無い",
  theme_stock_theme_id_theme_id_fk: "そのテーマは無い",
  theme_stock_stock_id_stock_id_fk: "その銘柄は無い",
};

/**
 * 渡した値が列に入らないときの pg のエラーコードの先頭2桁。
 * 数の範囲外（22003）・形式違い（22P02）・日付や時刻の形式違い（22007）と
 * 範囲外（22008）が、すべてこの1つのまとまりに入る。
 * 制約違反は 23、接続断は 08 で、どちらもここには当たらず投げ直す。
 *
 * 画面から来る値はすべて文字列のまま、または Number() を通して DB に渡している。
 * Number() は数字でない文字列を NaN に、桁数の多い文字列をそのままの数にするが、
 * どちらも integer 列には入らない。制約違反ではないため MESSAGES を通らない。
 * <input> や <select> からはこの値が出ないが、Server Action は画面を通さず直接POSTできる。
 *
 * 今のスキーマの列は数値・日付・文字列だけで、このまとまりのエラーは画面から来た値が
 * 列に入らないときにしか出ない。ただし 2200H（id の採番が 2147483647 を超えた）だけは
 * このまとまりに入るのに入力の話ではない。手で登録するイベントでは届かないため分けない。
 * uuid や json の列を足すと、実装側のバグも同じコードで出るようになるため、
 * そのときは列ごとの判定が要る
 */
const INVALID_VALUE_CLASS = "22";

/**
 * 登録を実行し、上の表にある制約違反なら日本語のエラー文を返す。
 * 列に入らない値も日本語のエラー文にする。それ以外のエラーは投げ直す。
 * 握りつぶすと、理由が出ないまま失敗する画面になる
 */
async function run(operation: Promise<unknown>): Promise<string | null> {
  try {
    await operation;
  } catch (error) {
    const { code, constraint } = pgError(error);
    const message = MESSAGES[constraint ?? ""];
    if (message) {
      return message;
    }
    if (code?.startsWith(INVALID_VALUE_CLASS)) {
      // どの列かは pg のエラーから取れないため、文言は列ごとに分けない
      return "入力に使えない値がある";
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

/** integer 列に入る最大値。これを超える値を渡すと型変換エラーになる */
const MAX_ID = 2147483647;

/**
 * event.id として問い合わせに渡してよい値かを判定する。
 *
 * 画面やURLから来る id は文字列で、Number() が NaN や integer の範囲外の数を
 * 返すことがある。それをそのまま integer 列に渡すと、制約違反ではない
 * 型変換エラーになり、日本語化を通らず 500 になる（設計書 §6）
 */
export function isEventId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= MAX_ID;
}

/** 問い合わせに渡せないIDなら日本語のエラー文を返す */
function invalidId(id: number): string | null {
  return isEventId(id) ? null : "そのイベントは見つからない";
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
