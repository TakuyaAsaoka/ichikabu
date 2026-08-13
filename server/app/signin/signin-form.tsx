"use client";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleGoogle() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      });
      const body: { url?: string } = await response.json();
      if (!response.ok || !body.url) {
        setPending(false);
        setError(messageFor(response.status));
        return;
      }
      // Google の同意画面へ移る。戻り先は /api/auth/callback/google
      window.location.assign(body.url);
    } catch {
      setPending(false);
      setError("通信に失敗しました。もう一度試してください");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // event.currentTarget は await をまたぐと null になるため、先に読む
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
    } catch {
      // 通信そのものが失敗した場合（切断・サーバー停止中）。
      // ここで拾わないと「送信中」のまま固まり、やり直せなくなる
      setPending(false);
      setError("通信に失敗しました。もう一度試してください");
      return;
    }

    if (response.ok) {
      // ページを読み込み直して移る。取得済みの内容やルーターの状態に左右されず、
      // サインインで付いた Cookie を確実にサーバーへ渡すため
      window.location.assign("/");
      return;
    }

    setPending(false);
    setError(messageFor(response.status));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={pending}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        Google でログイン
      </button>
      {/* メールアドレスとパスワードは iOS が使う経路と同じもの。
          Google の設定が壊れた日に管理UIへ入る手段として残す */}
      <p className="text-center">または</p>
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
      <p className="text-error empty:hidden" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
