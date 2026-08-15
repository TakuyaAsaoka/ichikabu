import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../../test/helpers";
import {
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "../../test/render-page";

const EDITOR = "editor@example.com";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../src/auth");
const { seedUser } = await import("../../src/db/seed-user");
const { default: Page } = await import("./page");

/** クエリ文字列の `error` を渡して画面を描く */
function open(error?: string | string[]) {
  return () => Page({ searchParams: Promise.resolve({ error }) });
}

beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  requestHeaders.current = new Headers();
});

describe("サインインの画面", () => {
  it("サインイン済みで開くと管理画面へ戻される", async () => {
    requestHeaders.current = await signInAs(auth.handler, EDITOR);

    expect(await redirectedTo(open())).toBe("/");
  });

  it("エラーが無いときはエラー文を出さない", async () => {
    const html = await render(open());

    expect(html).not.toContain("Google でのログインに失敗しました");
    expect(html).not.toContain("この Google アカウントではログインできません");
  });

  it("許していない Google アカウントには、その旨を出す", async () => {
    expect(await render(open("signup_disabled"))).toContain(
      "この Google アカウントではログインできません",
    );
  });

  it("URLに入れた文字列は画面に出さない", async () => {
    // 中身をそのまま出すと、このアドレスを開かせるだけで偽の案内文を
    // ログイン画面に載せられる
    const html = await render(open("いますぐ ここ に暗証番号を入れてください"));

    expect(html).not.toContain("暗証番号");
    expect(html).toContain("Google でのログインに失敗しました");
  });

  it("同じキーが2回来て配列になっても、そのまま出さない", async () => {
    // Google の認証は errorCallbackURL に戻すため、キーは何度でも足せる
    const html = await render(open(["signup_disabled", "偽の案内文"]));

    expect(html).not.toContain("偽の案内文");
    expect(html).toContain("Google でのログインに失敗しました");
  });
});
