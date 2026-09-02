import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../../src/auth";
import { record } from "../../src/db/audit";
import { seedUser } from "../../src/db/seed-user";
import { createStock, createTheme } from "../../src/db/write";
import { entriesOf, resetDatabase } from "../../test/helpers";
import {
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "../../test/render-page";
import { requestHeaders } from "../../test/setup";
import Page from "./page";

// この画面は管理者だけが開ける。管理者のメールアドレスは `test/setup.ts` が
// `Admin@Example.com` に差し替えており、下の ADMIN はそれと同じ人を指す
// （`seedUser` が小文字にして入れるため、大文字違いで同じ人になる）
const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

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

// サインインしていない人の追い返しは `test/pages.test.ts` の表が見ている。
// 下の「管理者ではない入力者」は行き先が `/` で別物なのでここに残す
describe("監査ログの画面", () => {
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
