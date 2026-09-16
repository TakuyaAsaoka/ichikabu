// @vitest-environment jsdom
// メニューの中身は閉じている間はHTMLに出ない（開いて初めて描かれる）ため、
// この1本はブラウザの真似（jsdom）で動かす。`app/form.test.tsx` と同じ形
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

// サインアウトの中身は `app/app-shell/sign-out.test.ts` が見る。
// ここは「押したら呼ばれるか」だけを見たいので、呼び先を差し替える。
// 差し替えないと `src/auth` の読み込み（DBと秘密鍵）まで巻き込む
const signOut = vi.hoisted(() => vi.fn());
vi.mock("./sign-out", () => ({ signOut }));

// 描いたものを毎回片付ける。`globals` を切っているため、Testing Library の
// 自動の片付けが登録されず、放っておくと2本目以降でボタンが2つ見つかる
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EMAIL = "editor@example.com";

/** メニューを開いた状態にする */
async function open() {
  const user = userEvent.setup();
  render(<AccountMenu email={EMAIL} />);
  await user.click(screen.getByRole("button"));
  return user;
}

describe("アカウントのメニュー", () => {
  it("誰として入っているかが、閉じている間も読み上げに出る", () => {
    render(<AccountMenu email={EMAIL} />);

    // スマホではメールアドレスを見せないが、読み上げには残す。
    // 読み上げの名前は中の文字から作られる（アイコンは `aria-hidden`）
    expect(screen.getByRole("button").textContent).toBe(
      `${EMAIL}（アカウントのメニュー）`,
    );
  });

  it("開くとメールアドレスとサインアウトが並ぶ", async () => {
    await open();

    expect(screen.getByRole("menu").textContent).toContain(EMAIL);
    expect(
      screen.getByRole("menuitem", { name: "サインアウト" }),
    ).toBeDefined();
  });

  it("サインアウトを選ぶと、サインアウトが呼ばれる", async () => {
    const user = await open();

    await user.click(screen.getByRole("menuitem", { name: "サインアウト" }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("行き先はここに入れない", async () => {
    // 行き先はサイドバーと下のタブが全部持つ（`app/app-shell/nav.tsx`）。
    // ここに混ぜると、同じ行き先が端末によって2か所に出る
    await open();

    expect(screen.queryAllByRole("menuitem")).toHaveLength(1);
  });
});
