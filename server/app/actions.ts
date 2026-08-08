"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";

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
