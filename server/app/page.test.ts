import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../src/auth";
import { seedUser } from "../src/db/seed-user";
import { createStock, createTheme, createThemeStock } from "../src/db/write";
import { htmlOf } from "../test/dom";
import { entriesOf, resetDatabase } from "../test/helpers";
import { PASSWORD, render, signInAs } from "../test/render-page";
import { requestHeaders } from "../test/setup";
import Page from "./page";

const EDITOR = "editor@example.com";

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

// 追い返しと `Nav` の出し分け、行き先の名前と見出しが揃っているかは、
// `test/pages.test.ts` の表が全画面ぶん見ている
beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  requestHeaders.current = await signInAs(auth.handler, EDITOR);
});

describe("銘柄とテーマの画面", () => {
  it("登録フォームが3つとも出る", async () => {
    // フォームを丸ごと落としても、一覧だけ見ていると気づけない。
    // 見出しの文字列（「銘柄を登録」等）はフォームが消えても残るため、
    // そのフォームにしか無い入力の名前で見る。
    // テーマ所属のフォームは、テーマと銘柄がどちらも在るときだけ出る
    await addStock("7203", "トヨタ自動車");
    await addTheme("半導体");

    const html = await render(Page);

    expect(html).toContain('name="ticker"'); // 銘柄を登録
    expect(html).toContain('name="themeId"'); // テーマ所属を登録
    // テーマを登録は `name="name"` だけで、銘柄を登録と同じ名前を使う。
    // フォームの数で見分ける（この画面に置くフォームは3つ）
    expect(html.match(/<form\b/g)).toHaveLength(3);
  });

  it("銘柄とテーマが一覧に出て、各行から編集ページへ行ける", async () => {
    const stockId = await addStock("7203", "トヨタ自動車");
    const themeId = await addTheme("半導体");

    const html = await render(Page);
    expect(html).toContain("トヨタ自動車");
    expect(html).toContain("3月決算");
    expect(html).toContain("半導体");
    expect(html).toContain(`href="/stocks/${stockId}"`);
    expect(html).toContain(`href="/themes/${themeId}"`);
  });

  it("銘柄・テーマ・テーマ所属が、それぞれ決まった順に並ぶ", async () => {
    // 3つの問い合わせの並び順をまとめて見る。作った順と並び順がずれる題材に
    // する。作った順で並べても同じになる題材だと、`orderBy` が落ちても
    // 緑のまま通る（`app/stocks/[id]/page.test.ts` と同じ考え方）
    const toyota = await addStock("7203", "トヨタ自動車");
    const sony = await addStock("6758", "ソニーグループ");
    // 「半導体」「防衛」は、DBの照合順序がどれでも前後が入れ替わらない2語
    // （`app/stocks/[id]/page.test.ts` に選んだ経緯がある）
    await addTheme("防衛");
    const semiconductor = await addTheme("半導体");
    entriesOf(await createThemeStock(Number(semiconductor), Number(toyota)));
    entriesOf(await createThemeStock(Number(semiconductor), Number(sony)));

    const html = await render(Page);

    // 銘柄とテーマは一覧とテーマ所属のフォームの両方に出る。同じ問い合わせから
    // 出ているので、選択肢の並びを見れば一覧の並びも押さえられる。選択肢で見るのは、
    // 一覧の `<li>` には「/ 3月決算」や編集リンクが混ざり、並び順と関係ない
    // 変更で赤くなるため
    expect(htmlOf(html, 'select[name="stockId"] option')).toEqual([
      "JP 6758 ソニーグループ",
      "JP 7203 トヨタ自動車",
    ]);
    expect(htmlOf(html, 'select[name="themeId"] option')).toEqual([
      "半導体",
      "防衛",
    ]);
    // テーマ所属はテーマ一覧の中の入れ子の `<ul>` にしか出ない。
    // 「防衛」の「銘柄なし」まで並ぶので、テーマの並び順もここに出る
    expect(htmlOf(html, "ul ul li")).toEqual([
      `JP 6758 ソニーグループ <a class="underline" href="/themes/${semiconductor}/stocks/${sony}">外す</a>`,
      `JP 7203 トヨタ自動車 <a class="underline" href="/themes/${semiconductor}/stocks/${toyota}">外す</a>`,
      "銘柄なし",
    ]);
  });

  it("テーマ所属は所属しているテーマの下にだけぶら下がる", async () => {
    // テーマを2件にする。1件だけだと、`app/page.tsx` の「このテーマの所属だけを
    // 取り出す」を外しても同じHTMLになり、壊しても緑のまま通る。
    // 銘柄を1件捨てるのは、銘柄とテーマのIDを別の数にするため。同じ数だと
    // 外すリンクの2つのIDを入れ替えても気づけない
    await addStock("6758", "ソニーグループ");
    const stockId = await addStock("7203", "トヨタ自動車");
    const themeId = await addTheme("半導体");
    const emptyId = await addTheme("防衛");
    entriesOf(await createThemeStock(Number(themeId), Number(stockId)));

    const html = await render(Page);
    expect(html).toContain(`href="/themes/${themeId}/stocks/${stockId}"`);
    // 所属を持たない側は「銘柄なし」のまま。空白で表すと「所属が無い」のか
    // 「読めていない」のか見分けが付かないため、文字で出す
    expect(html).toContain("銘柄なし");
    // 先に両方が出ていることを確かめる。片方が出ていないと indexOf が -1 になり、
    // 下の「前に出る」が素通りする
    expect(html).toContain(`href="/themes/${emptyId}"`);
    expect(html.indexOf(`href="/themes/${emptyId}"`)).toBeLessThan(
      html.indexOf("銘柄なし"),
    );
  });
});
