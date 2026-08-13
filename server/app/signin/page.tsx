import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { SignInForm } from "./signin-form";

/** サインイン画面。サインイン済みで開いたら管理画面へ戻す */
export default async function SignInPage({
  searchParams,
}: {
  // Google の認証が失敗すると errorCallbackURL（この画面）に error 付きで戻ってくる
  searchParams: Promise<{ error?: string }>;
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
        <p className="text-error">
          {error === "signup_disabled"
            ? "この Google アカウントではログインできません"
            : `Google でのログインに失敗しました（${error}）`}
        </p>
      )}
      <SignInForm />
    </>
  );
}
