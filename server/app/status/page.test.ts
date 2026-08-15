import { beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, resetDatabase } from "../../test/helpers";
import { PASSWORD, render, signInAs } from "../../test/render-page";

const EDITOR = "editor@example.com";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../src/auth");
const { seedUser } = await import("../../src/db/seed-user");
const { createStock } = await import("../../src/db/write");
const { GAP_KINDS, GAP_TITLES } = await import("../../src/status");
const { default: Page } = await import("./page");

beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  requestHeaders.current = await signInAs(auth.handler, EDITOR);
});

describe("状態の画面", () => {
  it("抜けの種類を5つとも出す", async () => {
    // 判定は `src/status.ts` のテストが見ている。ここが見るのは、
    // 5種類の見出しが画面に並ぶこと。1種類を出し忘れると、その抜けは
    // 誰の目にも触れないまま残る
    const html = await render(Page);

    expect(GAP_KINDS).toHaveLength(5);
    for (const kind of GAP_KINDS) {
      expect(html).toContain(GAP_TITLES[kind]);
    }
  });

  it("抜けが1件も無い種類は「抜けなし」と出る", async () => {
    // 空白で表すと「抜けが無い」のか「調べていない」のか見分けが付かない
    expect(await render(Page)).toContain("抜けなし");
  });

  it("抜けのある行は直す先へのリンクを出す", async () => {
    // 決算月の無い銘柄は「決算月なし」に出る。行から編集ページへ行ける
    const [created] = entriesOf(
      await createStock({
        market: "JP",
        ticker: "7203",
        name: "トヨタ自動車",
        fiscalMonth: null,
      }),
    );

    const html = await render(Page);
    expect(html).toContain("トヨタ自動車");
    expect(html).toContain(`href="/stocks/${created.resourceId}"`);
    // 種類ごとの件数まで見る。件数を見ないと、`app/status/page.tsx` の
    // 「その種類だけを取り出す」を外しても、どの区画にも同じ行が出て緑になる
    expect(html).toContain("決算月なし（1件）");
    expect(html).toContain("出典の表示名なし（0件）");
  });
});
