import { beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, idOf, resetDatabase } from "../../../test/helpers";
import { PASSWORD, render, signInAs } from "../../../test/render-page";

const EDITOR = "editor@example.com";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../../src/auth");
const { seedUser } = await import("../../../src/db/seed-user");
const { createStock, createTheme, createThemeStock } = await import(
  "../../../src/db/write"
);
const { default: Page } = await import("./page");

/** 追い返し・見出し・見つからない扱いは `test/pages.test.ts` の表が見ている */
beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  requestHeaders.current = await signInAs(auth.handler, EDITOR);
});

/** 書き込みが失敗しても例外は飛ばないため、`idOf` で包んでその場で落とす */
async function addTheme(name = "半導体"): Promise<string> {
  return idOf(await createTheme(name));
}

async function addStock(ticker: string, name: string): Promise<string> {
  return idOf(
    await createStock({ market: "JP", ticker, name, fiscalMonth: 3 }),
  );
}

describe("テーマの編集画面", () => {
  it("登録済みのテーマ名が、入力欄の初期値として出る", async () => {
    // テーマを1件捨ててIDを 1 から動かす。`resetDatabase` が採番を1に戻すため、
    // 素直に1件だけ作るとIDが 1 になり、画面がIDを取り違えていても気づけない
    await addTheme("旅行");
    const id = await addTheme();

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    // 更新先のID。ここが抜けると、更新のつもりで別の行を書き換える。
    // 削除のフォームにも同じ `name="id"` が入るため、最初の <form>（更新）に絞る。
    // 絞らないと、更新のフォームから消しても削除のフォームの分で緑のまま通る（実測）
    expect(html.split("</form>")[0]).toContain(`name="id" value="${id}"`);
    expect(html).toContain('name="name" value="半導体"');
  });

  it("所属している銘柄の一覧と、その件数を出した確認の文が出る", async () => {
    // テーマを消すと所属も一緒に消える。何が外れるかを画面と確認の両方に出す。
    // 別のテーマに付いた銘柄を1件混ぜる。問い合わせの絞り込みが落ちたら、
    // この銘柄まで並んで件数も増える
    const id = await addTheme();
    const other = await addTheme("旅行");
    const toyota = await addStock("7203", "トヨタ自動車");
    const sony = await addStock("6758", "ソニーグループ");
    const ana = await addStock("9202", "ANAホールディングス");
    entriesOf(await createThemeStock(Number(id), Number(toyota)));
    entriesOf(await createThemeStock(Number(id), Number(sony)));
    entriesOf(await createThemeStock(Number(other), Number(ana)));

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(html).toContain(">JP 7203 トヨタ自動車</li>");
    expect(html).toContain(">JP 6758 ソニーグループ</li>");
    expect(html).not.toContain("ANAホールディングス");
    expect(html).not.toContain("所属している銘柄なし");
    expect(html).toContain(
      'data-confirm="「半導体」を削除する。所属している銘柄2件も外れる。取り消せない。"',
    );
  });

  it("所属している銘柄が無いときは、確認の文に外れる件数を出さない", async () => {
    const id = await addTheme();

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(html).toContain("所属している銘柄なし");
    expect(html).toContain(
      'data-confirm="「半導体」を削除する。取り消せない。"',
    );
  });
});
