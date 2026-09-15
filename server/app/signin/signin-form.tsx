"use client";

import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldLabel } from "../form";

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
 * 回数制限を通らないため（設計書 §6）
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
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/",
          // 既定の戻り先は Better Auth の /error。本番ではそこから / へ飛ばされ、
          // セッションが無いので何も出ないままこの画面に戻ってくる（開発中は
          // ライブラリの英語のエラーページが出る）。
          // 許可していないアカウントで押したときに理由を出すため、自分で受ける
          errorCallbackURL: "/signin",
        }),
      });
      // 本文より先に応答コードを見る。設定漏れのときは本文の無い 500 が返り、
      // json() が例外になって「通信に失敗しました」に化ける
      if (!response.ok) {
        setPending(false);
        setError(messageFor(response.status));
        return;
      }
      const body: { url?: string } = await response.json();
      if (!body.url) {
        setPending(false);
        setError("Google のログインURLを取得できませんでした");
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
      {/* 押せない間も文字は読める明るさのままにする（`app/form.tsx` と同じ理由。#161） */}
      <Button
        type="button"
        size="lg"
        onClick={handleGoogle}
        disabled={pending}
        className="disabled:opacity-100"
      >
        Google でログイン
      </Button>
      {/* メールアドレスとパスワードは、Google の設定が壊れた日に
          管理UIへ入る手段として残す（全体設計書 §9）。
          普段使う入り口ではないので、ボタンは枠だけの `outline` にする */}
      <p className="text-center">または</p>
      <Label className={fieldLabel}>
        メールアドレス
        <Input type="email" name="email" required />
      </Label>
      <Label className={fieldLabel}>
        パスワード
        <Input type="password" name="password" required />
      </Label>
      <Button
        type="submit"
        variant="outline"
        size="lg"
        disabled={pending}
        // `border-input`: 枠だけのボタンの枠は input の色にする（CLAUDE.md「色」）。
        // 部品の既定は `border-border` で、背景との差が 1.22 しかなくボタンの形が
        // 見えない（input は 3.63）。部品のコードは書き換えず、呼ぶ側で渡す
        className="border-input disabled:opacity-100"
      >
        {pending ? "送信中" : "サインイン"}
      </Button>
      {/* 断りを色だけで伝えない（`app/form.tsx` と同じ形。CLAUDE.md「色」） */}
      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>サインインできませんでした</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
