"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import { createHolding, createStock } from "../src/db/register";

/**
 * メールアドレスとパスワードでサインインする。
 * 戻り値は失敗したときのエラー文で、useActionState の状態になる。
 * 成功したときは redirect が制御を移すため値を返さない
 */
export async function signIn(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (error) {
    // Better Auth はパスワード誤りを APIError で投げる（設計書 §7 B）。
    // それ以外は原因が分からないので投げ直す
    if (error instanceof APIError) {
      return "メールアドレスまたはパスワードが違います";
    }
    throw error;
  }

  // redirect は例外を投げて制御を移す仕組みのため、上の catch の外に置く。
  // 中に入れると成功したのにエラー表示になる（設計書 §7 C）
  redirect("/");
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
    // <select> の選択肢は JP と US だけ。それ以外が来たら JP として扱わず弾く
    market: formData.get("market") === "US" ? "US" : "JP",
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
