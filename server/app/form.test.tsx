// @vitest-environment jsdom
// この1本だけブラウザの真似（jsdom）で動かす。`vitest.config.ts` に書くと
// 他のテストファイル全部が jsdom の読み込みに引きずられる
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { ActionForm } from "./form";
import type { ActionResult } from "./notice";

// 描いたものを毎回片付ける。`globals` を切っているため、Testing Library の
// 自動の片付けが登録されず、放っておくと2本目以降でボタンが2つ見つかる。
// `window.confirm` の差し替えも戻す。戻さないとブラウザ側の関数を書き換えたまま
// 次のテストへ持ち越す。
// 出したトーストも消す。sonner はトーストを部品の外（読み込んだ1つの置き場）に持ち、
// 新しく描いた Toaster へ出し直す（dist/index.mjs の `subscribe`）。消さないと
// 前のテストの知らせが次のテストに出る。ブラウザでは再読み込みで置き場ごと消える
afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

const MESSAGE = "「半導体」を削除する。取り消せない。";

/**
 * 送信ボタンを1つ持つフォームを描く。
 * `confirm` を省くと、確認ダイアログを出さないボタンになる
 */
function setup(confirm?: string) {
  // Server Action の代わり。押した結果が送信まで届いたかを、ここで受け取る
  const submitted = vi.fn();
  render(
    <ActionForm
      action={async () => {
        submitted();
        return { notice: "theme-removed" };
      }}
      submitLabel="削除する"
      confirm={confirm}
    >
      <input name="id" defaultValue="1" />
    </ActionForm>,
  );
  return {
    submitted,
    button: screen.getByRole("button", { name: "削除する" }),
  };
}

describe("送信前の確認", () => {
  it("確認でキャンセルすると、送信は始まらない", async () => {
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { submitted, button } = setup(MESSAGE);

    await userEvent.click(button);

    expect(confirmed).toHaveBeenCalledWith(MESSAGE);
    // ここだけ待たずにその場で見る。押すと送信のイベントがその場で飛び、React は
    // その中で Server Action を呼ぶため、押し終わった時点で送信は始まっている。
    // `vi.waitFor` で包んでも待ったことにはならない。1回目の検査が通ればその場で
    // 返るので、落ちるときに1秒遅くなるだけ
    expect(submitted).not.toHaveBeenCalled();
  });

  it("確認でOKを選ぶと、送信が始まる", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { submitted, button } = setup(MESSAGE);

    await userEvent.click(button);

    await vi.waitFor(() => expect(submitted).toHaveBeenCalled());
  });

  // 確認ダイアログを常にキャンセルにしておく。確認の文を渡していないボタンで
  // ダイアログが出てしまえば、送信が止まってこのテストが赤くなる
  it("確認の文を渡していないボタンは、確認を出さずに送信する", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { submitted, button } = setup();

    await userEvent.click(button);

    await vi.waitFor(() => expect(submitted).toHaveBeenCalled());
  });
});

/**
 * 知らせの読み上げの領域の中に、その言葉が出ている数。
 *
 * sonner のトーストは `role="status"` を持たない。読み上げは、Toaster が常に描く
 * `<section aria-live="polite">` が受け持つ（sonner 2.0.8 の dist/index.mjs）。
 * 言葉が画面のどこかに出ただけでは読み上げに届いたことにならないので、領域の中に
 * あるものだけを数える
 */
function announced(text: string): number {
  return screen
    .queryAllByText(text)
    .filter((element) => element.closest('[aria-live="polite"]') !== null)
    .length;
}

/** Toaster と、決まった結果を返すフォームを描く。骨組み（`app/app-shell/app-shell.tsx`）と同じ組み合わせ */
function setupWithToaster(result: ActionResult) {
  render(
    <>
      <Toaster theme="light" />
      <ActionForm action={async () => result} submitLabel="銘柄を登録">
        <input name="ticker" defaultValue="7203" />
      </ActionForm>
    </>,
  );
  return screen.getByRole("button", { name: "銘柄を登録" });
}

describe("済んだあとの知らせ", () => {
  it("登録が済むと、読み上げの領域に知らせの言葉が出る", async () => {
    const button = setupWithToaster({ notice: "stock-added" });

    await userEvent.click(button);

    await vi.waitFor(() => expect(announced("銘柄を登録しました")).toBe(1));
  });

  // 知らせを useActionState の状態に残して useEffect で出す形だと、同じ結果が
  // 続いたときに状態が変わらず、2回目が出ない（#164 の討論）
  it("同じ登録を2回続けると、知らせも2回出る", async () => {
    const button = setupWithToaster({ notice: "stock-added" });

    await userEvent.click(button);
    await vi.waitFor(() => expect(announced("銘柄を登録しました")).toBe(1));
    await userEvent.click(button);

    await vi.waitFor(() => expect(announced("銘柄を登録しました")).toBe(2));
  });

  it("断りはフォームの直下に出て、知らせの形では出さない", async () => {
    const button = setupWithToaster({ error: "登録済みのティッカー" });

    await userEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("登録済みのティッカー");
    expect(alert.closest("form")).not.toBeNull();
    expect(announced("登録済みのティッカー")).toBe(0);
  });
});
