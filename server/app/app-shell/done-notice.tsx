"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { DONE_PARAM, isNoticeKey, NOTICES } from "../notice";

/**
 * 更新・削除が済んで移った先で、一度だけ出す知らせ（Issue #164）。
 *
 * 済んだことは行き先の URL の印（`?done=`）で受け取る（`app/actions.ts` の `action()`）。
 * 出したら URL から印を外す。外さないと、再読み込みのたびに同じ知らせが出る。
 * 登録の知らせはここを通らない（`app/form.tsx` の ActionForm が戻り値から出す）。
 *
 * 描くのは何も無い。トーストは骨組みに置いた Toaster が出す
 */
export function DoneNotice() {
  // 骨組みは画面を移っても付け直されない。印を見るのが最初の1回だけだと、
  // 2回目の更新・削除で知らせが出ない。URL が変わるたびに見直すため、
  // `useSearchParams()` を効果の依存にする（#164 の討論）
  const searchParams = useSearchParams();

  useEffect(() => {
    const key = searchParams.get(DONE_PARAM);
    if (key === null) {
      return;
    }
    // 1回待ってから外す。ページを丸ごと読み込んだときは、この効果が Next.js の
    // replaceState の差し替えより先に走り、待たないと Next.js が履歴に持たせた
    // 状態ごと消えて「戻る」が効かなくなる（novel-system #71 で実測）。
    // 待つ間に効果が片付けられたら（開発中の二度走り）、出すのも外すのもやめる。
    // そうすれば知らせが2つ並ばない
    const id = setTimeout(() => {
      // 表に無い値は言葉にしない。印は外す
      if (isNoticeKey(key)) {
        toast(NOTICES[key]);
      }
      const url = new URL(window.location.href);
      url.searchParams.delete(DONE_PARAM);
      window.history.replaceState(null, "", url);
    });
    return () => clearTimeout(id);
  }, [searchParams]);

  return null;
}
