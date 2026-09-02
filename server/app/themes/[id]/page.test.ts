import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../../../src/auth";
import { seedUser } from "../../../src/db/seed-user";
import {
  createStock,
  createTheme,
  createThemeStock,
} from "../../../src/db/write";
import { htmlOf } from "../../../test/dom";
import { entriesOf, idOf, resetDatabase } from "../../../test/helpers";
import { PASSWORD, render, signInAs } from "../../../test/render-page";
import { requestHeaders } from "../../../test/setup";
import Page from "./page";

const EDITOR = "editor@example.com";

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

async function addStock(
  ticker: string,
  name: string,
  market: "JP" | "US" = "JP",
): Promise<string> {
  // 決算月はJP銘柄にだけ入れられる
  // （`src/db/schema.ts` の `stock_fiscal_month_market_check`）
  return idOf(
    await createStock({
      market,
      ticker,
      name,
      fiscalMonth: market === "JP" ? 3 : null,
    }),
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
    // ティッカーが後になる 7203 を先に作る。作った順で並べても市場+ティッカー順で
    // 並べても同じになる題材だと、`orderBy` が落ちても緑のまま通る。
    // US を1件混ぜて、市場をまたいでも1つの一覧に並ぶことを見る。ただし JP は
    // 数字・US は英字で数字が先に来るため、`orderBy` から `stock.market` を
    // 落としても並びは変わらない。第1のキーが市場であることは見ていない
    const toyota = await addStock("7203", "トヨタ自動車");
    const sony = await addStock("6758", "ソニーグループ");
    const apple = await addStock("AAPL", "Apple", "US");
    const ana = await addStock("9202", "ANAホールディングス");
    entriesOf(await createThemeStock(Number(id), Number(toyota)));
    entriesOf(await createThemeStock(Number(id), Number(sony)));
    entriesOf(await createThemeStock(Number(id), Number(apple)));
    entriesOf(await createThemeStock(Number(other), Number(ana)));

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(htmlOf(html, "li")).toEqual([
      "JP 6758 ソニーグループ",
      "JP 7203 トヨタ自動車",
      "US AAPL Apple",
    ]);
    expect(html).toContain(
      'data-confirm="「半導体」を削除する。所属している銘柄3件も外れる。取り消せない。"',
    );
  });

  it("所属している銘柄が無いときは、確認の文に外れる件数を出さない", async () => {
    const id = await addTheme();

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(htmlOf(html, "li")).toEqual(["所属している銘柄なし"]);
    expect(html).toContain(
      'data-confirm="「半導体」を削除する。取り消せない。"',
    );
  });
});
