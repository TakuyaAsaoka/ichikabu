"use client";

import { type ReactNode, useActionState } from "react";

// 5つのフォームが同じ骨格を持っていたため、ここに括り出した（設計書 §4.1）。
// useActionState がここに移ったことで、各フォームは初期値を出すだけの
// Server Component になっている

/** 入力欄の見た目。フォーム全部で同じものを使う */
export const field = "rounded border border-border p-2";

// ラベルと入力欄はコンポーネントに包まない。入力欄を children で受け取る形にすると、
// <label> の中に入力欄があることを biome が追えず noLabelWithoutControl に引っかかる。
// 包むのは見た目の指定だけにして、入れ子は各フォームに書いたまま残す
/** ラベルと入力欄を縦に並べる <label> の見た目 */
export const fieldLabel = "flex flex-col gap-1";

/** Server Action は useActionState の形（前の状態と FormData を受け取る）で渡す */
export type Action = (
  previous: string | null,
  formData: FormData,
) => Promise<string | null>;

/**
 * Server Action を送るフォームの外枠。送信中の表示とエラー表示を持つ。
 * confirm に文字列を渡すと、送信ボタンを押したときに確認ダイアログが出る
 */
export function ActionForm({
  action,
  submitLabel,
  confirm,
  children,
}: {
  action: Action;
  submitLabel: string;
  confirm?: string;
  children: ReactNode;
}) {
  const [error, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      <button
        type="submit"
        disabled={pending}
        // 確認の文は属性に出し、onClick はそこから読む。クロージャに閉じ込めると
        // 描いたHTMLに1文字も出ず、テストから確かめられない（Issue #123）
        data-confirm={confirm}
        // 確認は <form onSubmit> ではなくここに置く。送信ボタンの click を止めれば
        // 送信自体が始まらず、React を挟まないブラウザの動きだけで済む（設計書 §4.1）
        onClick={(e) => {
          const message = e.currentTarget.dataset.confirm;
          if (message && !window.confirm(message)) {
            e.preventDefault();
          }
        }}
        className="rounded border border-border p-2 disabled:opacity-50"
      >
        {pending ? "送信中" : submitLabel}
      </button>
      <p className="text-error empty:hidden" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
