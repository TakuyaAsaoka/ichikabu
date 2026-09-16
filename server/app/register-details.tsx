import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * 登録フォームを、押したときだけ開く（#165）。閉じて描き、一覧を先に見せる。
 *
 * **HTML の開閉（`<details>`）で作る。** 討論で3案を比べて決めた。
 *
 * - 別のページ（`/events/new` など）は棄てた。続けて何件も入れるたびに一覧と
 *   行き来する。IDの要らない画面は全部が骨組みの行き先という `test/pages.test.ts` の
 *   約束も書き換えることになる
 * - shadcn の `sheet` は棄てた。開いている間は一覧が面の後ろに隠れ、登録した行が
 *   加わったかを見られない。閉じた中身がサーバーのHTMLに出ないので、フォームの
 *   選択肢の並びを見るテストも描けなくなる
 *
 * 登録の Server Action は画面に留まる（`app/actions.ts` の `redirectTo` を持たない）ので、
 * 送ったあとも開いたまま、欄は空に戻り、一覧に行が加わる。断りも開いたまま出る
 * （幅 390px のブラウザで実測）。
 *
 * 見た目は目立ちの弱い塗りのボタン（`secondary`）。中の送信ボタン（`primary`）より
 * 強く見せない。枠だけのボタンにしないのは、枠の色を呼ぶ側で直す決まり
 * （`app/globals-css.test.ts`）が `<Button>` しか見張らず、ここでは効かないため
 */
export function RegisterDetails({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className={buttonVariants({
          variant: "secondary",
          size: "lg",
          // `list-none` と `-webkit-details-marker` で、ブラウザが付ける三角を消す。
          // 開いているかは右の矢印の向きで示す
          className:
            "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        })}
      >
        {/* 名前は `<span>` に入れる。テストが矢印の svg を拾わずに名前だけを取り出すため */}
        <span>{label}</span>
        <ChevronDownIcon
          className="transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
