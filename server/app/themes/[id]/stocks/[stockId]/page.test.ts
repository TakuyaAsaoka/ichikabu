import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteResult } from "../../../../../src/db/write";
import { entriesOf, resetDatabase } from "../../../../../test/helpers";
import { PASSWORD, render, signInAs } from "../../../../../test/render-page";

const EDITOR = "editor@example.com";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../../../../src/auth");
const { seedUser } = await import("../../../../../src/db/seed-user");
const { createStock, createTheme, createThemeStock } = await import(
  "../../../../../src/db/write"
);
const { default: Page } = await import("./page");

/** 作った行のIDを返す。書き込みが失敗したらそこで落とす */
function idOf(result: WriteResult): string {
  return entriesOf(result)[0].resourceId;
}

/** 追い返し・見出し・見つからない扱いは `test/pages.test.ts` の表が見ている */
beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  requestHeaders.current = await signInAs(auth.handler, EDITOR);
});

describe("テーマ所属を外す画面", () => {
  it("外す先のテーマIDと銘柄IDを、そのまま送り先へ渡す", async () => {
    // 2つのIDが入れ替わると、別の所属が消える。
    // 銘柄を1件捨ててIDを別の数にする。同じ数だと入れ替えても気づけない
    await createStock({
      market: "JP",
      ticker: "6758",
      name: "ソニーグループ",
      fiscalMonth: 3,
    });
    const stockId = idOf(
      await createStock({
        market: "JP",
        ticker: "7203",
        name: "トヨタ自動車",
        fiscalMonth: 3,
      }),
    );
    const themeId = idOf(await createTheme("半導体"));
    entriesOf(await createThemeStock(Number(themeId), Number(stockId)));

    const html = await render(() =>
      Page({ params: Promise.resolve({ id: themeId, stockId }) }),
    );
    expect(themeId).not.toBe(stockId);
    expect(html).toContain(`name="themeId" value="${themeId}"`);
    expect(html).toContain(`name="stockId" value="${stockId}"`);
    // 何を外すのかが画面に出る（設計書 §3）
    expect(html).toContain("半導体");
    expect(html).toContain("トヨタ自動車");
  });
});
