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

/** 編集する銘柄。決算月の入る JP 銘柄にする */
async function addStock(
  ticker = "7203",
  name = "トヨタ自動車",
): Promise<string> {
  return idOf(
    await createStock({ market: "JP", ticker, name, fiscalMonth: 3 }),
  );
}

/**
 * 銘柄のIDを 1 から動かす。
 *
 * `resetDatabase` が採番を1に戻すため、素直に1件だけ作るとIDが 1 になり、
 * 画面がIDを取り違えていても気づけない
 */
async function shiftStockIds(): Promise<void> {
  await addStock("6758", "ソニーグループ");
}

describe("銘柄の編集画面", () => {
  it("登録済みの値が、すべての入力欄の初期値として出る", async () => {
    await shiftStockIds();
    const id = await addStock();

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    // 更新先のID。ここが抜けると、更新のつもりで別の行を書き換える。
    // 削除のフォームにも同じ `name="id"` が入るため、最初の <form>（更新）に絞る。
    // 絞らないと、更新のフォームから消しても削除のフォームの分で緑のまま通る（実測）
    expect(html.split("</form>")[0]).toContain(`name="id" value="${id}"`);
    expect(html).toContain('<option value="JP" selected="">JP</option>');
    expect(html).not.toContain('<option value="US" selected="">');
    expect(html).toContain('name="ticker" value="7203"');
    expect(html).toContain('name="name" value="トヨタ自動車"');
    expect(html).toContain('<option value="3" selected="">3</option>');
  });

  it("決算月の無いUS銘柄では、決算月がどれも選ばれない", async () => {
    // fiscalMonth は null。`?? ""` を落とすと <select> の初期選択が先頭（なし）に
    // 落ちるだけで見た目が同じになるため、選ばれた月が1つも無いことで見る
    const id = idOf(
      await createStock({
        market: "US",
        ticker: "AAPL",
        name: "Apple",
        fiscalMonth: null,
      }),
    );

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(html).toContain('<option value="US" selected="">US</option>');
    expect(html).toContain('<option value="" selected="">なし</option>');
    expect(html).not.toMatch(/<option value="\d+" selected="">/);
  });

  it("所属しているテーマの一覧と、その件数を出した確認の文が出る", async () => {
    // 銘柄を消すとテーマ所属も一緒に消える。何が外れるかを画面と確認の両方に出す。
    // 別の銘柄に付いたテーマを1件混ぜる。問い合わせの絞り込みが落ちたら、
    // このテーマまで並んで件数も増える
    const other = await addStock("6758", "ソニーグループ");
    const id = await addStock();
    const semiconductor = idOf(await createTheme("半導体"));
    const defense = idOf(await createTheme("防衛"));
    const unrelated = idOf(await createTheme("旅行"));
    entriesOf(await createThemeStock(Number(semiconductor), Number(id)));
    entriesOf(await createThemeStock(Number(defense), Number(id)));
    entriesOf(await createThemeStock(Number(unrelated), Number(other)));

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(html).toContain(">半導体</li>");
    expect(html).toContain(">防衛</li>");
    expect(html).not.toContain(">旅行</li>");
    expect(html).not.toContain("所属しているテーマなし");
    expect(html).toContain(
      'data-confirm="「トヨタ自動車」を削除する。所属しているテーマ2件も外れる。取り消せない。"',
    );
  });

  it("所属しているテーマが無いときは、確認の文に外れる件数を出さない", async () => {
    const id = await addStock();

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(html).toContain("所属しているテーマなし");
    expect(html).toContain(
      'data-confirm="「トヨタ自動車」を削除する。取り消せない。"',
    );
  });
});
