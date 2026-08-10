"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import {
  createEvent,
  createHolding,
  createStock,
  createTheme,
  createThemeStock,
} from "../src/db/register";
import { toEventInput } from "./event-input";

// サインインはここに置かない。ブラウザから Better Auth の HTTP エンドポイントを
// 叩く（app/signin/signin-form.tsx）。auth.api の直接呼び出しは回数制限を通らないため（設計書 §6）

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
 * 決算月の入力を読む。
 * フォームの空欄は FormData で "" になり、そのまま smallint に入れると
 * 制約違反ではない型変換エラーで 500 になる（設計書 §7 A）
 */
function toFiscalMonth(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "");
  return text === "" ? null : Number(text);
}

/** 銘柄を登録する。戻り値は失敗したときのエラー文で、useActionState の状態になる */
export async function addStock(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireUserId();

  const message = await createStock({
    // <select> の選択肢は JP と US だけだが、値の妥当性はここで絞り込まず
    // そのまま渡し、DB の stock_market_check 制約に弾かせる（設計書 §5）
    market: String(formData.get("market") ?? ""),
    ticker: String(formData.get("ticker") ?? ""),
    name: String(formData.get("name") ?? ""),
    fiscalMonth: toFiscalMonth(formData.get("fiscalMonth")),
  });
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
