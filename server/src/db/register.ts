import { db } from ".";
import { holding, stock } from "./schema";
import { violatedConstraint } from "./violation";

/**
 * 制約違反を画面に出す日本語にする（設計書 §5）。
 * 制約名は server/drizzle/0000_simple_blacklash.sql の実物
 */
const MESSAGES: Record<string, string> = {
  stock_market_ticker_unique: "その市場のティッカーは登録済み",
  stock_ticker_check:
    "ティッカーは半角の数字・英大文字・ピリオド・ハイフンだけ使える",
  stock_fiscal_month_market_check: "決算月はJP銘柄にだけ入れられる",
  stock_fiscal_month_check: "決算月は1〜12",
  holding_user_id_stock_id_pk: "その銘柄はすでに保有に登録済み",
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
  market: "JP" | "US";
  ticker: string;
  name: string;
  /** 決算月（1〜12）。JP銘柄のみ。US銘柄では null（全体設計書 §4.1） */
  fiscalMonth: number | null;
};

/** 銘柄を登録する。成功で null、制約違反で日本語のエラー文を返す */
export function createStock(input: StockInput): Promise<string | null> {
  return run(db.insert(stock).values(input));
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
