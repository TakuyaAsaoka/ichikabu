import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { SignInForm } from "./signin-form";

/** サインイン画面。サインイン済みで開いたら管理画面へ戻す */
export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/");
  }

  return (
    <>
      <h1 className="text-xl font-bold">イチカブ 管理</h1>
      <SignInForm />
    </>
  );
}
