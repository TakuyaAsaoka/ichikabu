import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, resetDatabase } from "../test/helpers";
import { PASSWORD, redirectedTo, render, signInAs } from "../test/render-page";

const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

// 画面は読み込みの時点で ADMIN_EMAIL を読むため、読み込む前に入れる
// （`app/audit/page.test.ts` と同じ理由）
vi.stubEnv("ADMIN_EMAIL", "Admin@Example.com");
afterAll(() => {
  vi.unstubAllEnvs();
});

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../src/auth");
const { seedUser } = await import("../src/db/seed-user");
const { createStock, createTheme, createThemeStock } = await import(
  "../src/db/write"
);
const { default: Page } = await import("./page");

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signIn(email: string): Promise<void> {
  requestHeaders.current = await signInAs(auth.handler, email);
}

/** 銘柄を1件作り、採番されたIDを返す */
async function addStock(): Promise<number> {
  const [created] = entriesOf(
    await createStock({
      market: "JP",
      ticker: "7203",
      name: "トヨタ自動車",
      fiscalMonth: 3,
    }),
  );
  return Number(created.resourceId);
}

/** テーマを1件作り、採番されたIDを返す */
async function addTheme(): Promise<number> {
  const [created] = entriesOf(await createTheme("半導体"));
  return Number(created.resourceId);
}

beforeEach(async () => {
  await resetDatabase();
  await seedUser(ADMIN, PASSWORD);
  await seedUser(EDITOR, PASSWORD);
});

describe("銘柄とテーマの画面", () => {
  it("サインインしていないとサインインの画面へ追い返される", async () => {
    requestHeaders.current = new Headers();

    expect(await redirectedTo(Page)).toBe("/signin");
  });

  it("見出しは `app/nav.tsx` がこの画面に付けた名前と同じ", async () => {
    // リンクの名前と着いた先の名前が違うと、着いたかどうかが分からない。
    // 両方をこの画面のHTMLから取り出して比べる。片方だけ直すと落ちる。
    // 見出しの文字列そのものは `test/pages.test.ts` の表が押さえている
    await signIn(EDITOR);

    const html = await render(Page);
    const heading = /<h1[^>]*>([^<]*)<\/h1>/.exec(html)?.[1];
    const navLabel = /<a [^>]*href="\/"[^>]*>([^<]*)<\/a>/.exec(html)?.[1];
    expect(heading).toBeTruthy();
    expect(navLabel).toBe(heading);
  });

  it("画面の行き先が4つとも出る", async () => {
    // `app/nav.tsx` の `LINKS` を見る場所。`Nav` を呼んでいるかどうかは
    // `test/pages.test.ts` が全画面ぶん見ている
    await signIn(EDITOR);

    const html = await render(Page);
    for (const href of ["/", "/events", "/contributions", "/status"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("銘柄とテーマが一覧に出て、各行から編集ページへ行ける", async () => {
    const stockId = await addStock();
    const themeId = await addTheme();
    await signIn(EDITOR);

    const html = await render(Page);
    expect(html).toContain("トヨタ自動車");
    expect(html).toContain("半導体");
    expect(html).toContain(`href="/stocks/${stockId}"`);
    expect(html).toContain(`href="/themes/${themeId}"`);
  });

  it("テーマ所属はテーマの下にぶら下がり、行から外すページへ行ける", async () => {
    const stockId = await addStock();
    const themeId = await addTheme();
    entriesOf(await createThemeStock(themeId, stockId));
    await signIn(EDITOR);

    const html = await render(Page);
    expect(html).toContain(`href="/themes/${themeId}/stocks/${stockId}"`);
    expect(html).not.toContain("銘柄なし");
  });

  it("所属の無いテーマは「銘柄なし」と出る", async () => {
    // 空白で表すと「所属が無い」のか「読めていない」のか見分けが付かない
    await addTheme();
    await signIn(EDITOR);

    expect(await render(Page)).toContain("銘柄なし");
  });
});
