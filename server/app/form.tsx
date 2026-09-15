"use client";

import { type ReactNode, useActionState } from "react";
import { Button } from "@/components/ui/button";

// 5つのフォームが同じ骨格を持っていたため、ここに括り出した（設計書 §4.1）。
// useActionState がここに移ったことで、各フォームは初期値を出すだけの
// Server Component になっている

// 入力欄の見た目（`field`）はここに持たない。`@/components/ui` の
// `Input`・`NativeSelect`・`Textarea` が持つ（#161）

/**
 * ラベルと入力欄を縦に並べる `Label` の見た目。
 *
 * 部品の `Label` は既定で横並び（`flex items-center gap-2`）なので、縦に積み直す。
 * ラベルと入力欄はコンポーネントに包まない。入力欄を children で受け取る形にすると、
 * `<label>` の中に入力欄があることを biome が追えず noLabelWithoutControl に引っかかる。
 * 包むのは見た目の指定だけにして、入れ子は各フォームに書いたまま残す
 */
export const fieldLabel = "flex flex-col items-start gap-1";

/**
 * 選択欄の外枠を、他の入力欄と同じ幅にする。
 * 部品の `NativeSelect` は外枠が `w-fit` で、中身の長さだけの幅になる。
 * 渡さないと、選択肢の文字数しだいで欄の幅が行ごとにばらつく
 */
export const fieldSelect = "w-full";

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
  variant = "default",
  children,
}: {
  action: Action;
  submitLabel: string;
  confirm?: string;
  /**
   * ボタンの色。消す・外す操作は `destructive` を渡す。
   *
   * **`confirm` の有無から決めない。** テーマ所属を外す画面は削除だが確認を出さない
   * （テーマも銘柄も残り、入れ直せるため。設計書 §3）ので、
   * `confirm` で決めるとこの画面だけ登録と同じ色になる
   */
  variant?: "default" | "destructive";
  children: ReactNode;
}) {
  const [error, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      <Button
        type="submit"
        // 消す操作は消す色で出す。登録・更新と削除が同じ見た目だと押し分けられない（#161）
        variant={variant}
        size="lg"
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
        // `self-start`: フォームは縦に伸ばす並びなので、付けないとボタンが横幅いっぱいに広がる。
        //
        // `disabled:opacity-100`: 押せない間も文字は読める明るさのままにする。
        // 部品は既定で、押せない間だけ半分透かす。そうすると文字と背景の明るさの差が
        // 読める目安を割る。押せないことは、文字が「送信中」に変わることと、
        // 指が乗らないことで示す（#161）
        className="self-start disabled:opacity-100"
      >
        {pending ? "送信中" : submitLabel}
      </Button>
      <p className="text-destructive empty:hidden" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
