import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../../../../../src/auth";
import { seedUser } from "../../../../../src/db/seed-user";
import {
  createStock,
  createTheme,
  createThemeStock,
} from "../../../../../src/db/write";
import { entriesOf, idOf, resetDatabase } from "../../../../../test/helpers";
import { stockInput } from "../../../../../test/inputs";
import { PASSWORD, render, signInAs } from "../../../../../test/render-page";
import { requestHeaders } from "../../../../../test/setup";
import Page from "./page";

const EDITOR = "editor@example.com";

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
    // 銘柄名は下で画面に出ているかを見るので明示する
    const stockId = idOf(
      await createStock(stockInput({ name: "トヨタ自動車" })),
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
