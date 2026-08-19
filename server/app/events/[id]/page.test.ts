import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteResult } from "../../../src/db/write";
import { entriesOf, resetDatabase } from "../../../test/helpers";
import { PASSWORD, render, signInAs } from "../../../test/render-page";

const EDITOR = "editor@example.com";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../../src/auth");
const { seedUser } = await import("../../../src/db/seed-user");
const { createEvent, createStock, createTheme } = await import(
  "../../../src/db/write"
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

describe("イベントの編集画面", () => {
  it("登録済みの値が、すべての入力欄の初期値として出る", async () => {
    // 欄ごとに違う値を入れる。同じ値だと欄を取り違えても気づけない。
    // 対象はテーマにする。市場・銘柄の選択肢も並ぶので、選ばれるのが1つだけであることを見る
    const stockId = idOf(
      await createStock({
        market: "JP",
        ticker: "7203",
        name: "トヨタ自動車",
        fiscalMonth: 3,
      }),
    );
    const themeId = idOf(await createTheme("半導体"));
    const id = idOf(
      await createEvent({
        title: "半導体関連の決算発表",
        shortLabel: "半導決算",
        startDate: "2026-09-01",
        endDate: "2026-09-03",
        time: "14:30",
        importance: 1,
        note: "前回は延期になった",
        sourceUrl: "https://example.com/ir",
        sourceName: "内閣府（PDL1.0）",
        market: null,
        themeId: Number(themeId),
        stockId: null,
      }),
    );

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    // 更新先のID。ここが抜けると、更新のつもりで別の行を書き換える。
    // 削除のフォームにも同じ `name="id"` が入るため、最初の <form>（更新）に絞る。
    // 絞らないと、更新のフォームから消しても削除のフォームの分で緑のまま通る（実測）
    expect(html.split("</form>")[0]).toContain(`name="id" value="${id}"`);
    expect(html).toContain('name="title" value="半導体関連の決算発表"');
    expect(html).toContain('name="shortLabel" value="半導決算"');
    expect(html).toContain('name="startDate" value="2026-09-01"');
    expect(html).toContain('name="endDate" value="2026-09-03"');
    // time 列は "14:30:00" で返る。<input type="time"> は秒を扱わないため先頭5文字だけ渡す
    expect(html).toContain('name="time" value="14:30"');
    expect(html).toContain('name="sourceUrl" value="https://example.com/ir"');
    expect(html).toContain('name="sourceName" value="内閣府（PDL1.0）"');
    expect(html).toContain("<textarea");
    expect(html).toContain(">前回は延期になった</textarea>");
    // 重要度は既定が 2。1 を選んでいるので、初期値を渡し忘れると 2 が選ばれる
    expect(html).toContain('<option value="1" selected="">1</option>');
    // 対象は1つの <select>。3列のうち埋まっている1列から "theme:1" の形を組み立てる
    expect(html).toContain(`<option value="theme:${themeId}" selected="">`);
    expect(html).not.toContain(`<option value="stock:${stockId}" selected="">`);
    expect(html).not.toContain('<option value="market:JP" selected="">');
  });

  it("削除の確認は、消すイベントの題名を出す", async () => {
    const id = idOf(
      await createEvent({
        title: "半導体関連の決算発表",
        shortLabel: "半導決算",
        startDate: "2026-09-01",
        endDate: null,
        time: null,
        importance: 2,
        note: null,
        sourceUrl: null,
        sourceName: null,
        market: "JP",
        themeId: null,
        stockId: null,
      }),
    );

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(html).toContain(
      'data-confirm="「半導体関連の決算発表」を削除する。取り消せない。"',
    );
  });
});
