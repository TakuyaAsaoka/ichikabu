"use client";

import { useActionState } from "react";
import { signIn } from "../actions";

/** サインインのフォーム。useActionState を使うため Client Component にする */
export function SignInForm() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
