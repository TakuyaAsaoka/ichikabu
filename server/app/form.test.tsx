// @vitest-environment jsdom
// この1本だけブラウザの真似（jsdom）で動かす。`vitest.config.ts` に書くと
// DBを触るテスト28本まで jsdom の読み込みに引きずられる
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionForm } from "./form";

// 描いたものを毎回片付ける。`globals` を切っているため、Testing Library の
// 自動の片付けが登録されず、放っておくと2本目以降でボタンが2つ見つかる。
// `window.confirm` の差し替えも戻す。戻さないとブラウザ側の関数を書き換えたまま
// 次のテストへ持ち越す
afterEach(() => {
  cleanup();
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
        return null;
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
