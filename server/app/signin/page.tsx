import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    // 他の9画面と同じ型（見出しと中身を幅 `max-w-3xl` の1列に直に積む）をやめ、
    // 幅を絞った1列を画面の中央に置く（#163）。
    //
    // **外枠も余白もこの画面が持つ。** 根の `app/layout.tsx` は `<html>` と `<body>`
    // だけで、`<main>` を持たない（#162 で外した。サインイン後の骨組みが
    // `<main>` の幅と余白を決めるため、サイドバーの外側に置けない）。
    // #163 は `app/layout.tsx` の `<main>` の `p-6` を当てにして
    // `min-h-[calc(100dvh-3rem)]` と書いていたが、余白がこの要素に移ったので
    // 引き算そのものが要らなくなった（`box-sizing: border-box` なので
    // `min-h-dvh` の中に `p-6` が入る）。ファイルをまたぐ結び付きが1つ減る。
    //
    // **カードで包まない**（#163 で討論して決めた）。
    // shadcn の `card` の白い面は背景 `#f7f7fb` との明るさの差が 1.07、
    // 既定の枠（`ring-1 ring-foreground/10` を白の上で解いた `#e8e9eb`）は
    // 背景の上で 1.14 しかなく、囲いとして見えない（`border` の 1.22 より低い）。
    // 枠を `input` の色にすれば 3.87 で見えるが、
    // 部品の既定（枠・文字の大きさ）を呼ぶ側で3つ打ち消すことになる
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      {/* 見出しの文字は変えない。`test/pages.test.ts` の表と1文字ずつ突き合わせている */}
      <h1 className="text-center text-2xl font-bold">イチカブ 管理</h1>
      {error && (
        // 中身は画面に出さない。URLに入れた文字列がそのまま出ると、
        // このアドレスを開かせるだけで偽の案内文をログイン画面に載せられる。
        //
        // 出し方は `app/form.tsx` と同じ `Alert`。断りを色だけで伝えず、
        // 見出しの言葉でも「入れなかった」ことを出す（CLAUDE.md「色」）。
        // 同じ画面の下に出るフォームの断りと形をそろえる意味もある
        // （そろえないと、同じ失敗が2通りの見た目で出る）
        <Alert variant="destructive">
          <AlertTitle>サインインできませんでした</AlertTitle>
          <AlertDescription>
            {error === "signup_disabled"
              ? "この Google アカウントではログインできません"
              : "Google でのログインに失敗しました"}
          </AlertDescription>
        </Alert>
      )}
      <SignInForm />
    </main>
  );
}
