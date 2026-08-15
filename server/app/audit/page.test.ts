import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, resetDatabase } from "../../test/helpers";
import {
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "../../test/render-page";

const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

// 画面は読み込みの時点で ADMIN_EMAIL を読むため、読み込む前に入れる。
// 大文字を混ぜてあるのは `app/actions.test.ts` と同じ理由（seedUser が
// メールアドレスを小文字にして入れるので、揃えずに比べると管理者が居なくなる）
vi.stubEnv("ADMIN_EMAIL", "Admin@Example.com");
afterAll(() => {
  vi.unstubAllEnvs();
});

// next/headers は Next.js のリクエストの中でしか動かない。
// セッションは差し替えず、本物の Better Auth のトークンを headers に載せる
const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../src/auth");
const { record } = await import("../../src/db/audit");
const { seedUser } = await import("../../src/db/seed-user");
const { createTheme, createStock } = await import("../../src/db/write");
const { default: Page } = await import("./page");

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signIn(email: string): Promise<void> {
  requestHeaders.current = await signInAs(auth.handler, email);
}

/** 各テストの前に作り直す利用者のID。記録に残す人の出どころ */
const userIds = { admin: "", editor: "" };

beforeEach(async () => {
  await resetDatabase();
  userIds.admin = (await seedUser(ADMIN, PASSWORD)).userId;
  userIds.editor = (await seedUser(EDITOR, PASSWORD)).userId;
});

describe("監査ログの画面", () => {
  it("サインインしていないとサインインの画面へ追い返される", async () => {
    requestHeaders.current = new Headers();

    expect(await redirectedTo(Page)).toBe("/signin");
  });

  it("管理者ではない入力者は追い返される", async () => {
    // 入力者に監査ログは見せない（入力者を3人にする設計書 §2）。
    // 画面から入口を消すだけでは、URL を直に打つ経路が塞がったか判定できない
    await signIn(EDITOR);

    expect(await redirectedTo(Page)).toBe("/");
  });

  it("記録が0件のとき、その旨が出る", async () => {
    await signIn(ADMIN);

    expect(await render(Page)).toContain("記録なし");
  });

  it("管理者には日時・操作した人・種別・対象が新しい順に出る", async () => {
    await record(userIds.admin, entriesOf(await createTheme("半導体")));
    await record(
      userIds.admin,
      entriesOf(
        await createStock({
          market: "JP",
          ticker: "7203",
          name: "トヨタ自動車",
          fiscalMonth: 3,
        }),
      ),
    );
    await signIn(ADMIN);

    const html = await render(Page);
    expect(html).toContain(ADMIN);
    expect(html).toContain("登録");
    // 先に両方が出ていることを確かめる。片方が出ていないと indexOf が -1 になり、
    // 下の「前に出る」が素通りする
    expect(html).toContain("銘柄 #1");
    expect(html).toContain("テーマ #1");
    // 新しい銘柄の登録が、古いテーマの登録より前に出る
    expect(html.indexOf("銘柄 #1")).toBeLessThan(html.indexOf("テーマ #1"));
  });

  it("取り込みが入れた記録は操作した人が「取り込み」と出る", async () => {
    await record(null, entriesOf(await createTheme("半導体")));
    await signIn(ADMIN);

    expect(await render(Page)).toContain("取り込み");
  });
});
