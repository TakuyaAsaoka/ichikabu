"use client";

import { type ReactNode, useActionState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type Action, NOTICES } from "./notice";

// 5つのフォームが同じ骨格を持っていたため、ここに括り出した（設計書 §4.1）。
// useActionState がここに移ったことで、各フォームは初期値を出すだけの
// Server Component になっている

// 入力欄の見た目（`field`）はここに持たない。`@/components/ui` の
// `Input`・`NativeSelect`・`Textarea` が持つ（#161）

/**
 * ラベルと入力欄を縦に並べる `Label` の見た目。
 *
 * 部品の `Label` は既定で横並び（`flex items-center gap-2`）なので、縦に積み直す。
 *
 * **ラベルと入力欄を1つのコンポーネントに包まない。** 包むと、`<label>` の中に
 * 入力欄があることを biome が追えず、noLabelWithoutControl が見なくなる。
 * ここが持つのは見た目の指定だけにして、入れ子は各フォームに書いたまま残す。
 *
 * 素の `<label>` を `Label` に替えた時点で、biome の既定はこの入れ子を見なくなる
 * （部品の名前を知らないため）。`server/biome.json` の `noLabelWithoutControl` に
 * `labelComponents`・`inputComponents` を書いて見えるようにしてある（#161）
 */
export const fieldLabel = "flex flex-col items-start gap-1";

/**
 * 選択欄の外枠を、他の入力欄と同じ幅にする。
 * 部品の `NativeSelect` は外枠が `w-fit` で、中身の長さだけの幅になる。
 * 渡さないと、選択肢の文字数しだいで欄の幅が行ごとにばらつく
 */
export const fieldSelect = "w-full";

/**
 * Server Action を送るフォームの外枠。送信中の表示・断りの表示・済んだあとの知らせを持つ。
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
  const [error, formAction, pending] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const result = await action(formData);
      // 知らせは送るたびにここで出し、状態には残さない。状態に残して useEffect で
      // 出す形だと、同じ登録が2回続いたときに状態が変わらず2回目が出ない（#164 の討論）。
      // 更新・削除はここへ戻らずに移る（`redirect()`）。移った先で出すのは
      // `app/app-shell/done-notice.tsx`
      if ("notice" in result) {
        toast(NOTICES[result.notice]);
        return null;
      }
      return result.error;
    },
    null,
  );

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
      {/* 断りを色だけで伝えない。見出しの言葉で「送れなかった」ことを出し、
          色は添えるだけにする（CLAUDE.md「意味を色だけで運ばない」）。
          部品の `Alert` は `role="alert"` を持つので、読み上げにも届く */}
      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>送れませんでした</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
