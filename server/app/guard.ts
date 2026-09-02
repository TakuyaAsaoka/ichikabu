import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "../src/admin";
import { auth } from "../src/auth";
import { isId } from "../src/db/write";

// 画面と Server Action が最初に通す判定（Issue #140）。
//
// ここに置く前は、9枚の画面が同じ4行を、4枚が同じ5行を書き写していた。
// 書き写す形だと、画面を1枚足したときに書き忘れてもエラーにならず、
// サインインしていない人に中身が見える画面が黙って1枚増える。
//
// **レイアウト（`app/(admin)/layout.tsx`）にはしない。** 画面のテストは
// `renderToStaticMarkup(await Page())` で描いており（`test/render-page.ts` の
// `render`）、レイアウトは Next.js のルーターが合成するためこの呼び方では
// 一度も描かれない。判定がテストの届かない場所へ移る
// （管理画面を分ける設計書 §3 が実測で棄却済み）。
// 画面が自分で呼ぶ関数なら、今のテストがそのまま判定を見られる。
//
// `app/actions.ts` には置けない。あのファイルは "use server" で、公開できるのは
// 非同期の関数だけ（Next.js 同梱ドキュメント
// 01-app/01-getting-started/07-mutating-data.md）。`src/admin.ts` の `isAdmin` を
// 外に出してあるのと同じ理由

/** サインインしている利用者。監査ログに残す利用者IDの出どころでもある */
export type Session = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/**
 * サインインしているかを確かめてセッションを返す。していなければサインイン画面へ送る。
 *
 * **画面と Server Action の両方がこれを通る。** Server Action は画面を通さず
 * 直接POSTできるため、画面側の確認とは別に Server Action でも確かめる
 * （Next.js 同梱ドキュメント 01-app/01-getting-started/07-mutating-data.md の警告。
 * → 監査ログ 設計書 §4）。
 *
 * `app/signin/page.tsx` はこれを使わない。あの画面は「サインイン**済み**なら
 * 追い返す」という逆の判定で、行き先も違う
 */
export async function requireSession(): Promise<Session> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/signin");
  }
  return session;
}

/** セッションを確かめて利用者IDを返す */
export async function requireUserId(): Promise<string> {
  return (await requireSession()).user.id;
}

/**
 * 管理者だけが開ける画面で使う。管理者でなければ管理画面へ追い返す。
 *
 * **Server Action の管理者の判定とは別にする。** あちらは `redirect()` にせず
 * エラー文を返す（理由は `app/actions.ts` の `requireAdmin` に書いた）。
 *
 * 画面のほうは追い返して構わない。開いただけで何も起きないため、
 * 拒否と成功を見分ける必要が無い。
 *
 * 画面から入口を消すだけでは足りない。URL を直に打てば開ける。
 * ここで止めれば、呼んだ画面は下の読み出しに進めない
 */
export async function requireAdminSession(): Promise<Session> {
  const session = await requireSession();
  if (!isAdmin(session.user.email)) {
    redirect("/");
  }
  return session;
}

/**
 * URL のIDを数にして返す。問い合わせに渡せない値なら見つからない扱いにする。
 *
 * 画面やURLから来る id は文字列で、`Number()` が NaN や integer の範囲外の数を
 * 返すことがある。それをそのまま integer 列に渡すと、制約違反ではない
 * 型変換エラーになり、日本語化を通らず 500 になる
 * （イベントの編集・削除 設計書 §6）。判定は Server Action と同じ `isId` を使う
 */
export function requireId(raw: string): number {
  const id = Number(raw);
  if (!isId(id)) {
    notFound();
  }
  return id;
}
