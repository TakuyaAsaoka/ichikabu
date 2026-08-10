"use client";

import { useActionState } from "react";
import { addTheme } from "./actions";

/**
 * テーマの登録フォーム。
 * name は notNull だが空文字を弾く CHECK が無いため、required で塞ぐ（設計書 §3）
 */
export function ThemeForm() {
  const [error, formAction, pending] = useActionState(addTheme, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        テーマ名
        <input
          type="text"
          name="name"
          required
          className="rounded border border-border p-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        {pending ? "送信中" : "テーマを登録"}
      </button>
      <p className="text-error empty:hidden" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
