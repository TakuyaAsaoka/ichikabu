import { beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../../src/db/seed-user";
import { createStock } from "../../../src/db/write";
import { GAP_KINDS, GAP_TITLES } from "../../../src/status";
import { entriesOf, resetDatabase } from "../../../test/helpers";
import { stockInput } from "../../../test/inputs";
import { PASSWORD, render, signInAs } from "../../../test/render-page";
import Page from "./page";

const EDITOR = "editor@example.com";

beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  await signInAs(EDITOR);
});

describe("状態の画面", () => {
  it("抜けの種類を4つとも出す", async () => {
    // 判定は `src/status.ts` のテストが見ている。ここが見るのは、
    // 4種類の見出しが画面に並ぶこと。1種類を出し忘れると、その抜けは
    // 誰の目にも触れないまま残る
    const html = await render(Page);

    for (const kind of GAP_KINDS) {
      expect(html).toContain(GAP_TITLES[kind]);
    }
  });

  it("抜けが1件も無い種類は「抜けなし」と出る", async () => {
    // 空白で表すと「抜けが無い」のか「調べていない」のか見分けが付かない
    expect(await render(Page)).toContain("抜けなし");
  });

  it("抜けの行には、色だけでなく言葉の印が付く", async () => {
    // 色の見分けが付きにくい人には、赤い文字だけでは何も伝わらない
    // （CLAUDE.md「意味を色だけで運ばない」）。
    // **抜けが0件のときに印が出ないことまで見る。** 出しっぱなしだと、
    // 印が抜けの行を1つも区別していないことになり、この検査が素通りする
    const before = await render(Page);
    expect(before).not.toContain('data-slot="badge"');

    // 決算月の無い銘柄は「決算月なし」の抜けになる
    entriesOf(await createStock(stockInput({ fiscalMonth: null })));

    const after = await render(Page);
    expect(after).toContain("抜け</span>");
  });

  it("抜けのある行は直す先へのリンクを出す", async () => {
    // 決算月の無い銘柄は「決算月なし」に出る。行から編集ページへ行ける
    const [created] = entriesOf(
      // 決算月なしが主題。銘柄名は下で画面に出ているかを見るので明示する
      await createStock(
        stockInput({ name: "トヨタ自動車", fiscalMonth: null }),
      ),
    );

    const html = await render(Page);
    expect(html).toContain("トヨタ自動車");
    expect(html).toContain(`href="/stocks/${created.resourceId}"`);
    // 種類ごとの件数まで見る。件数を見ないと、`app/status/page.tsx` の
    // 「その種類だけを取り出す」を外しても、どの区画にも同じ行が出て緑になる
    expect(html).toContain("決算月なし（1件）");
    expect(html).toContain("過ぎた非アクティブ（0件）");
  });
});
