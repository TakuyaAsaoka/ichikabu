import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { SignInForm } from "./signin-form";

/** サインイン画面。サインイン済みで開いたら管理画面へ戻す */
export default async function SignInPage({
  searchParams,
}: {
  // Google の認証が失敗すると errorCallbackURL（この画面）に error 付きで戻ってくる。
  // 同じキーが2回来ると配列になるため、文字列だけとは限らない
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold">イチカブ 管理</h1>
      {error && (
        // 中身は画面に出さない。URLに入れた文字列がそのまま出ると、
        // このアドレスを開かせるだけで偽の案内文をログイン画面に載せられる
        <p className="text-error">
          {error === "signup_disabled"
            ? "この Google アカウントではログインできません"
            : "Google でのログインに失敗しました"}
        </p>
      )}
      <SignInForm />
    </>
  );
}
