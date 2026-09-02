"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "../src/admin";
import { db } from "../src/db";
import { record } from "../src/db/audit";
import { stock, theme } from "../src/db/schema";
import {
  createEvent,
  createEvents,
  createStock,
  createTheme,
  createThemeStock,
  deleteEvent,
  deleteStock,
  deleteTheme,
  deleteThemeStock,
  type StockInput,
  updateEvent,
  updateStock,
  updateTheme,
  type WriteResult,
} from "../src/db/write";
import { toEventInputs } from "./bulk-event-input";
import { toEventInput } from "./event-input";
import { requireSession, requireUserId, type Session } from "./guard";

// サインインはここに置かない。ブラウザから Better Auth の HTTP エンドポイントを
// 叩く（app/signin/signin-form.tsx）。auth.api の直接呼び出しは回数制限を通らないため（設計書 §6）

/**
 * 管理者かどうかを確かめる。管理者なら null、そうでなければ拒む理由を返す。
 * 削除は取り返せないため、管理者だけができる（設計書 §9）。
 *
 * 拒み方を `redirect()` にしない。削除は成功しても `redirect("/")` するため、
 * 拒否と成功が同じ `NEXT_REDIRECT` になり、拒まれたことを画面でもテストでも
 * 見分けられなくなる（実測。→ 入力者を3人にする設計書 §4）。
 * 戻り値のエラー文は、他の Server Action と同じく ActionForm が表示する。
 *
 * セッションを自分で読まずに受け取る。読むと、記録に残す利用者IDを取るために
 * 同じセッションをもう1度読むことになる
 */
function requireAdmin(session: Session): string | null {
  return isAdmin(session.user.email) ? null : "削除できるのは管理者だけ";
}

/**
 * 書き込みを実行し、成功したら監査ログに記録する（設計書 §5.2）。
 * 成功で null、書き込みか記録の失敗で画面に出す日本語のエラー文を返す。
 *
 * **12の Server Action がすべてこれを通る。** 個々の関数が記録を自分で呼ぶ形に
 * しないのは、呼び忘れがそのまま記録の漏れになるため。3つ目の書き込みの経路が
 * 増えたときは `src/db/write-boundary.test.ts` が落ちる
 */
async function audited(
  userId: string | null,
  write: Promise<WriteResult>,
): Promise<string | null> {
  const result = await write;
  return typeof result === "string" ? result : record(userId, result);
}

/**
 * 決算月の入力を読む。
 * フォームの空欄は FormData で "" になり、そのまま smallint に入れると
 * 制約違反ではない型変換エラーで 500 になる（設計書 §7 A）
 */
function toFiscalMonth(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "");
  return text === "" ? null : Number(text);
}

/** 銘柄フォームの FormData を createStock / updateStock の入力にする */
function toStockInput(formData: FormData): StockInput {
  return {
    // <select> の選択肢は JP と US だけだが、値の妥当性はここで絞り込まず
    // そのまま渡し、DB の stock_market_check 制約に弾かせる（設計書 §5）
    market: String(formData.get("market") ?? ""),
    ticker: String(formData.get("ticker") ?? ""),
    name: String(formData.get("name") ?? ""),
    fiscalMonth: toFiscalMonth(formData.get("fiscalMonth")),
  };
}

/** 銘柄を登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function addStock(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await audited(userId, createStock(toStockInput(formData)));
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}

/** テーマを登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function addTheme(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await audited(
    userId,
    createTheme(String(formData.get("name") ?? "")),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}

/** テーマ所属を登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function addThemeStock(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await audited(
    userId,
    createThemeStock(
      Number(formData.get("themeId")),
      Number(formData.get("stockId")),
    ),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}

/** イベントを登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function addEvent(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await audited(userId, createEvent(toEventInput(formData)));
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}

// 更新・削除は成功したら一覧に戻す（設計書 §5.3）。編集ページに留まらせると
// 「更新した」を出すための状態を別に持つことになる。
// redirect() は例外を投げて動くため、revalidatePath() を先に呼ぶ

/** 銘柄を更新する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function editStock(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await audited(
    userId,
    updateStock(Number(formData.get("id")), toStockInput(formData)),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
}

/** 銘柄を削除する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function removeStock(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const session = await requireSession();
  const denied = requireAdmin(session);
  if (denied) {
    return denied;
  }

  const message = await audited(
    session.user.id,
    deleteStock(Number(formData.get("id"))),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
}

/** テーマを更新する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function editTheme(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await audited(
    userId,
    updateTheme(Number(formData.get("id")), String(formData.get("name") ?? "")),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
}

/** テーマを削除する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function removeTheme(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const session = await requireSession();
  const denied = requireAdmin(session);
  if (denied) {
    return denied;
  }

  const message = await audited(
    session.user.id,
    deleteTheme(Number(formData.get("id"))),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
}

/** テーマ所属を外す。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function removeThemeStock(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const session = await requireSession();
  const denied = requireAdmin(session);
  if (denied) {
    return denied;
  }

  const message = await audited(
    session.user.id,
    deleteThemeStock(
      Number(formData.get("themeId")),
      Number(formData.get("stockId")),
    ),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
}

/** イベントを更新する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function editEvent(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await audited(
    userId,
    updateEvent(Number(formData.get("id")), toEventInput(formData)),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  // イベントの一覧は `/events` にある（Issue #112）。`/` へ戻すと、
  // 今直したイベントが出ていない画面に着く
  redirect("/events");
}

/** イベントを削除する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function removeEvent(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const session = await requireSession();
  const denied = requireAdmin(session);
  if (denied) {
    return denied;
  }

  const message = await audited(
    session.user.id,
    deleteEvent(Number(formData.get("id"))),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  // 消したイベントが消えたことは `/events` の一覧でしか確かめられない
  redirect("/events");
}

/**
 * イベントをまとめて登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる。
 *
 * 対象はティッカーとテーマ名で書くため、IDを引くための対応表をここで読む（設計書 §3）。
 * 行ごとに問い合わせず、2回の読み出しで済ませる
 */
export async function addEvents(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const [stocks, themes] = await Promise.all([
    db
      .select({ id: stock.id, market: stock.market, ticker: stock.ticker })
      .from(stock),
    db.select({ id: theme.id, name: theme.name }).from(theme),
  ]);

  const inputs = toEventInputs(String(formData.get("rows") ?? ""), {
    stocks,
    themes,
  });
  if (typeof inputs === "string") {
    return inputs;
  }

  const message = await audited(userId, createEvents(inputs));
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}
