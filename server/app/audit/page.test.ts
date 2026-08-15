import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../../test/helpers";

const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";
const PASSWORD = "correct-horse-battery-staple";

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

type WriteResult = Awaited<ReturnType<typeof createTheme>>;

/** 書き込みが成功したことを判定し、記録を取り出す */
function entriesOf(result: WriteResult) {
  if (typeof result === "string") {
    throw new Error(`書き込みが失敗した: ${result}`);
  }
  return result;
}

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signInAs(email: string): Promise<void> {
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const cookie = res.headers.get("set-cookie");
  if (!cookie) {
    throw new Error(`サインインできなかった: ${email}`);
  }
  requestHeaders.current = new Headers({ cookie: cookie.split(";")[0] });
}

/**
 * 画面を描いてHTMLで返す。`redirect()` で追い返された場合はその行き先を投げる。
 *
 * Server Component は React の要素を返す非同期の関数なので、そのまま呼べる。
 * ブラウザもDOMも要らない（`react-dom/server` は next が依存に持っている）
 */
async function render(): Promise<string> {
  return renderToStaticMarkup(await Page());
}

/** `redirect()` の行き先。追い返されなかったら落とす */
async function redirectedTo(): Promise<string> {
  try {
    await render();
  } catch (error) {
    // digest は `NEXT_REDIRECT;replace;/signin;307;` の形（実測）
    const digest = (error as { digest?: string }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return digest.split(";")[2];
    }
    throw error;
  }
  throw new Error("追い返されるはずの画面が描けてしまった");
}

beforeEach(async () => {
  await resetDatabase();
  await seedUser(ADMIN, PASSWORD);
  await seedUser(EDITOR, PASSWORD);
});

describe("監査ログの画面", () => {
  it("サインインしていないとサインインの画面へ追い返される", async () => {
    requestHeaders.current = new Headers();

    expect(await redirectedTo()).toBe("/signin");
  });

  it("管理者ではない入力者は追い返される", async () => {
    // 入力者に監査ログは見せない（入力者を3人にする設計書 §2）。
    // 画面から入口を消すだけでは、URL を直に打つ経路が塞がったか判定できない
    await signInAs(EDITOR);

    expect(await redirectedTo()).toBe("/");
  });

  it("記録が0件のとき、その旨が出る", async () => {
    await signInAs(ADMIN);

    expect(await render()).toContain("記録なし");
  });

  it("管理者には日時・操作した人・種別・対象が新しい順に出る", async () => {
    const { userId } = await seedUser(ADMIN, PASSWORD);
    await record(userId, entriesOf(await createTheme("半導体")));
    await record(
      userId,
      entriesOf(
        await createStock({
          market: "JP",
          ticker: "7203",
          name: "トヨタ自動車",
          fiscalMonth: 3,
        }),
      ),
    );
    await signInAs(ADMIN);

    const html = await render();
    expect(html).toContain(ADMIN);
    // 新しい銘柄の登録が、古いテーマの登録より前に出る
    expect(html.indexOf("銘柄 #1")).toBeLessThan(html.indexOf("テーマ #1"));
    expect(html).toContain("登録");
  });

  it("取り込みが入れた記録は操作した人が「取り込み」と出る", async () => {
    await record(null, entriesOf(await createTheme("半導体")));
    await signInAs(ADMIN);

    expect(await render()).toContain("取り込み");
  });
});
