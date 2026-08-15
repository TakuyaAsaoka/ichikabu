import { beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, resetDatabase } from "../../test/helpers";
import {
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "../../test/render-page";

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../src/auth");
const { record } = await import("../../src/db/audit");
const { seedUser } = await import("../../src/db/seed-user");
const { createTheme, updateTheme, deleteTheme } = await import(
  "../../src/db/write"
);
const { default: Page } = await import("./page");

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signIn(email: string): Promise<void> {
  requestHeaders.current = await signInAs(auth.handler, email);
}

/** 各テストの前に作り直す利用者のID。記録に残す人の出どころ */
const userIds = { alice: "", bob: "" };

beforeEach(async () => {
  await resetDatabase();
  userIds.alice = (await seedUser(ALICE, PASSWORD)).userId;
  userIds.bob = (await seedUser(BOB, PASSWORD)).userId;
});

describe("貢献度の画面", () => {
  it("サインインしていないとサインインの画面へ追い返される", async () => {
    requestHeaders.current = new Headers();

    expect(await redirectedTo(Page)).toBe("/signin");
  });

  it("記録が0件のとき、その旨が出る", async () => {
    await signIn(ALICE);

    expect(await render(Page)).toContain("記録なし");
  });

  it("入力者ごとに登録・更新・削除の件数が出る", async () => {
    await record(userIds.alice, entriesOf(await createTheme("半導体")));
    await record(
      userIds.alice,
      entriesOf(await updateTheme(1, "半導体・製造装置")),
    );
    await record(userIds.alice, entriesOf(await deleteTheme(1)));
    await signIn(ALICE);

    const html = await render(Page);
    expect(html).toContain(ALICE);
    expect(html).toContain("登録 1件");
    expect(html).toContain("更新 1件");
    expect(html).toContain("削除 1件");
  });

  it("登録の多い入力者が先に出る", async () => {
    await record(userIds.alice, entriesOf(await createTheme("半導体")));
    await record(userIds.bob, entriesOf(await createTheme("防衛")));
    await record(userIds.bob, entriesOf(await createTheme("造船")));
    await signIn(ALICE);

    const html = await render(Page);
    // 先に両方が出ていることを確かめる。片方が出ていないと indexOf が -1 になり、
    // 下の「前に出る」が素通りする
    expect(html).toContain(ALICE);
    expect(html).toContain(BOB);
    expect(html.indexOf(BOB)).toBeLessThan(html.indexOf(ALICE));
  });

  it("取り込みが入れた記録は「取り込み」として数えられる", async () => {
    await record(null, entriesOf(await createTheme("半導体")));
    await signIn(ALICE);

    const html = await render(Page);
    expect(html).toContain("取り込み");
    expect(html).toContain("登録 1件");
  });

  it("入力者ごとに分かれて数えられる", async () => {
    await record(userIds.alice, entriesOf(await createTheme("半導体")));
    await record(userIds.bob, entriesOf(await createTheme("防衛")));
    await signIn(ALICE);

    // まとめて数えると「登録 2件」の1行になる。人数もそこで狂う
    expect(await render(Page)).toContain("（2人）");
  });

  it("取り込みは人数に数えない", async () => {
    await record(userIds.alice, entriesOf(await createTheme("半導体")));
    await record(null, entriesOf(await createTheme("防衛")));
    await signIn(ALICE);

    // 行は2つ出るが、人は1人。取り込みを人数に混ぜると「2人」になる
    expect(await render(Page)).toContain("（1人）");
  });
});
