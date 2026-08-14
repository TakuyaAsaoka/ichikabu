"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import { db } from "../src/db";
import { stock, theme } from "../src/db/schema";
import {
  createEvent,
  createEvents,
  createHolding,
  createStock,
  createTheme,
  createThemeStock,
  deleteEvent,
  deleteHolding,
  deleteStock,
  deleteTheme,
  deleteThemeStock,
  type StockInput,
  updateEvent,
  updateStock,
  updateTheme,
} from "../src/db/write";
import { toEventInputs } from "./bulk-event-input";
import { toEventInput } from "./event-input";

// サインインはここに置かない。ブラウザから Better Auth の HTTP エンドポイントを
// 叩く（app/signin/signin-form.tsx）。auth.api の直接呼び出しは回数制限を通らないため（設計書 §6）

// 管理者は1人で、役割はメールアドレスの一致だけで決める（設計書 §9）。
// 未設定のまま動かすと、誰も管理者にならず削除が全部拒まれる状態に静かになる。
// src/auth.ts の秘密鍵と同じく、読み込みの時点で落とす
const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
if (!adminEmail) {
  throw new Error(
    "ADMIN_EMAIL が設定されていない。削除できる管理者のメールアドレスを .env.local に入れること",
  );
}

/**
 * セッションを確かめて利用者IDを返す。
 * Server Action は画面を通さず直接POSTできるため、画面側の確認とは別にここでも確かめる
 * （Next.js 同梱ドキュメント 01-app/01-getting-started/07-mutating-data.md の警告）
 */
async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }
  return session.user.id;
}

/**
 * 管理者かどうかを確かめる。管理者なら null、そうでなければ拒む理由を返す。
 * 削除は取り返せないため、管理者だけができる（設計書 §9）。
 *
 * 拒み方を `redirect()` にしない。削除は成功しても `redirect("/")` するため、
 * 拒否と成功が同じ `NEXT_REDIRECT` になり、拒まれたことを画面でもテストでも
 * 見分けられなくなる（実測。→ 入力者を3人にする設計書 §4）。
 * 戻り値のエラー文は、他の14個の Server Action と同じく ActionForm が表示する
 */
async function requireAdmin(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }
  // seedUser がメールアドレスを小文字にして入れるため、比較も小文字で揃える
  return session.user.email.toLowerCase() === adminEmail
    ? null
    : "削除できるのは管理者だけ";
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
  await requireUserId();

  const message = await createStock(toStockInput(formData));
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}

/** 保有を登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function addHolding(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await createHolding(userId, Number(formData.get("stockId")));
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
  await requireUserId();

  const message = await createTheme(String(formData.get("name") ?? ""));
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
  await requireUserId();

  const message = await createThemeStock(
    Number(formData.get("themeId")),
    Number(formData.get("stockId")),
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
  await requireUserId();

  const message = await createEvent(toEventInput(formData));
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
  await requireUserId();

  const message = await updateStock(
    Number(formData.get("id")),
    toStockInput(formData),
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
  const denied = await requireAdmin();
  if (denied) {
    return denied;
  }

  const message = await deleteStock(Number(formData.get("id")));
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
}

/**
 * 保有を外す。戻り値は失敗したときのエラー文で、useActionState の状態になる。
 * 利用者IDはセッションから取る。画面からは渡さない（設計書 §2.1）。
 *
 * **削除5つのうち、ここだけ管理者に限らない。** `deleteHolding` は
 * `(user_id, stock_id)` で絞るため、呼んだ本人の行しか消せない
 * （src/db/write.test.ts「他の利用者の保有は消えない」）。管理者に限ると、
 * 入力者が足した保有は管理者にも消せない行になり、psql を叩くまで残る。
 * 保有は足し直せば戻るので、削除を限る理由（取り返せない）が当たらない
 */
export async function removeHolding(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const userId = await requireUserId();

  const message = await deleteHolding(userId, Number(formData.get("stockId")));
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
  await requireUserId();

  const message = await updateTheme(
    Number(formData.get("id")),
    String(formData.get("name") ?? ""),
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
  const denied = await requireAdmin();
  if (denied) {
    return denied;
  }

  const message = await deleteTheme(Number(formData.get("id")));
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
  const denied = await requireAdmin();
  if (denied) {
    return denied;
  }

  const message = await deleteThemeStock(
    Number(formData.get("themeId")),
    Number(formData.get("stockId")),
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
  await requireUserId();

  const message = await updateEvent(
    Number(formData.get("id")),
    toEventInput(formData),
  );
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
}

/** イベントを削除する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function removeEvent(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const denied = await requireAdmin();
  if (denied) {
    return denied;
  }

  const message = await deleteEvent(Number(formData.get("id")));
  if (message) {
    return message;
  }

  revalidatePath("/");
  redirect("/");
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
  await requireUserId();

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

  const message = await createEvents(inputs);
  if (message) {
    return message;
  }

  revalidatePath("/");
  return null;
}
