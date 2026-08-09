"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

/** 応答コードから画面に出す文を決める。原因を取り違えないよう、想定外は数字をそのまま見せる */
function messageFor(status: number): string {
  if (status === 401) return "メールアドレスまたはパスワードが違います";
  if (status === 429)
    return "試行が多すぎます。しばらく待ってからやり直してください";
  return `サインインに失敗しました（応答コード ${status}）`;
}

/**
 * サインインのフォーム。
 *
 * Server Action からサーバー側の `auth.api.signInEmail` を呼ぶのではなく、
 * ブラウザから Better Auth の HTTP エンドポイントを叩く。`auth.api` の直接呼び出しは
 * 回数制限を通らないため（設計書 §6）。iOS も同じエンドポイントを使う（全体設計書 §9）
 */
export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // event.currentTarget は await をまたぐと null になるため、先に読む
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (response.ok) {
      // 取得済みの内容を捨ててから移る。サインインで付いた Cookie を
      // サーバーに読ませたうえで `/` を描画させるため
      router.refresh();
      router.push("/");
      return;
    }

    setPending(false);
    setError(messageFor(response.status));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        メールアドレス
        <input
          type="email"
          name="email"
          required
          className="rounded border border-border p-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        パスワード
        <input
          type="password"
          name="password"
          required
          className="rounded border border-border p-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        {pending ? "送信中" : "サインイン"}
      </button>
      {error && (
        <p className="text-error" aria-live="polite">
          {error}
        </p>
      )}
    </form>
  );
}
