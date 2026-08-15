import { beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, resetDatabase } from "../test/helpers";
import { PASSWORD, render, signInAs } from "../test/render-page";

const EDITOR = "editor@example.com";

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

/** 銘柄を1件作り、採番されたIDを返す */
async function addStock(ticker: string, name: string): Promise<string> {
  const [created] = entriesOf(
    await createStock({ market: "JP", ticker, name, fiscalMonth: 3 }),
  );
  return created.resourceId;
}

/** テーマを1件作り、採番されたIDを返す */
async function addTheme(name: string): Promise<string> {
  const [created] = entriesOf(await createTheme(name));
  return created.resourceId;
}

// 追い返しと `Nav` の出し分けは `test/pages.test.ts` の表が全画面ぶん見ている
beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  requestHeaders.current = await signInAs(auth.handler, EDITOR);
});

describe("銘柄とテーマの画面", () => {
  it("見出しは `app/nav.tsx` がこの画面に付けた名前と同じ", async () => {
    // リンクの名前と着いた先の名前が違うと、着いたかどうかが分からない。
    // 両方をこの画面のHTMLから取り出して比べる。片方だけ直すと落ちる。
    // 見出しの文字列そのものは `test/pages.test.ts` の表が押さえている
    const html = await render(Page);

    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1];
    const navLabel = /<a [^>]*href="\/"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1];
    expect(heading).toBeTruthy();
    expect(navLabel).toBe(heading);
  });

  it("画面の行き先が4つとも出る", async () => {
    // `app/nav.tsx` の `LINKS` を見る場所。`Nav` を呼んでいるかどうかは
    // `test/pages.test.ts` が全画面ぶん見ている
    const html = await render(Page);

    for (const href of ["/", "/events", "/contributions", "/status"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("銘柄とテーマが一覧に出て、各行から編集ページへ行ける", async () => {
    const stockId = await addStock("7203", "トヨタ自動車");
    const themeId = await addTheme("半導体");

    const html = await render(Page);
    expect(html).toContain("トヨタ自動車");
    expect(html).toContain("半導体");
    expect(html).toContain(`href="/stocks/${stockId}"`);
    expect(html).toContain(`href="/themes/${themeId}"`);
  });

  it("テーマ所属は所属しているテーマの下にだけぶら下がる", async () => {
    // テーマを2件にする。1件だけだと、`app/page.tsx` の「このテーマの所属だけを
    // 取り出す」を外しても同じHTMLになり、壊しても緑のまま通る
    const stockId = await addStock("7203", "トヨタ自動車");
    const themeId = await addTheme("半導体");
    const emptyId = await addTheme("防衛");
    entriesOf(await createThemeStock(Number(themeId), Number(stockId)));

    const html = await render(Page);
    expect(html).toContain(`href="/themes/${themeId}/stocks/${stockId}"`);
    // 所属を持たない側は「銘柄なし」のまま。空白で表すと「所属が無い」のか
    // 「読めていない」のか見分けが付かないため、文字で出す
    expect(html).toContain("銘柄なし");
    expect(html.indexOf(`href="/themes/${emptyId}"`)).toBeLessThan(
      html.indexOf("銘柄なし"),
    );
  });
});
