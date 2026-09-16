"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { requireSession } from "../guard";

/**
 * サインアウトして、サインインの画面へ送る（Issue #162）。
 *
 * **サインインと違い、ブラウザから Better Auth の HTTP エンドポイントを叩かない。**
 * あちらがそうしているのは、パスワードの総当たりを10秒に3回で止める回数制限を
 * 通すため（`app/signin/signin-form.tsx`）。その規則が当たるのは `/sign-in`・
 * `/sign-up`・`/change-password`・`/change-email` の4つだけで、`/sign-out` は
 * 入っていない（better-auth 1.6.26 の `dist/api/rate-limiter/index.mjs:373` を読んで確認）。
 * 当てる的（推測する秘密）が無いので、通す理由も無い。
 *
 * `auth.api.signOut` はDBのセッションの行を消し、`src/auth.ts` の `nextCookies()` が
 * Server Action から Cookie を消す。
 *
 * **`app/actions.ts` には置かない。** あちらは書き込み関数を呼んでよい2つの
 * ファイルのうちの1つで（`src/db/write-boundary.test.ts`）、実データを変える
 * 操作だけを置く場所にしてある
 */
export async function signOut(): Promise<void> {
  // サインインしていない人が呼んでも、その場でサインインの画面へ送られる
  await requireSession();

  await auth.api.signOut({ headers: await headers() });

  redirect("/signin");
}
