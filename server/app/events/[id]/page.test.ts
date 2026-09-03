import { beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../../src/db/seed-user";
import {
  createEvent,
  createStock,
  createTheme,
  type EventInput,
} from "../../../src/db/write";
import { htmlOf } from "../../../test/dom";
import { idOf, resetDatabase } from "../../../test/helpers";
import { eventInput, stockInput } from "../../../test/inputs";
import { PASSWORD, render, signInAs } from "../../../test/render-page";
import Page from "./page";

const EDITOR = "editor@example.com";

/** 追い返し・見出し・見つからない扱いは `test/pages.test.ts` の表が見ている */
beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  await signInAs(EDITOR);
});

/** 空にできる欄をすべて空にしたイベント。埋めたい欄だけ上書きする */
const MINIMAL = eventInput({
  title: "CPIの発表",
  shortLabel: "CPI",
  startDate: "2026-09-01",
  importance: 2,
  market: "JP",
});

async function addEvent(overrides: Partial<EventInput> = {}): Promise<string> {
  return idOf(await createEvent({ ...MINIMAL, ...overrides }));
}

describe("イベントの編集画面", () => {
  it("登録済みの値が、すべての入力欄の初期値として出る", async () => {
    // 先にイベントを1件捨てて、編集するイベントのIDを 1 から動かす。
    // `resetDatabase` が採番を1に戻すため、素直に作ると銘柄もテーマもイベントも
    // IDが 1 になり、画面がIDを取り違えていても気づけない
    await addEvent();

    // 欄ごとに違う値を入れる。同じ値だと欄を取り違えても気づけない。
    // 対象はテーマにする。市場・銘柄の選択肢も並ぶので、選ばれるのが1つだけであることを見る
    const stockId = idOf(await createStock(stockInput()));
    const themeId = idOf(await createTheme("半導体"));
    const id = await addEvent({
      title: "半導体関連の決算発表",
      shortLabel: "半導決算",
      endDate: "2026-09-03",
      time: "14:30",
      importance: 1,
      note: "前回は延期になった",
      sourceUrl: "https://example.com/ir",
      sourceName: "内閣府（PDL1.0）",
      market: null,
      themeId: Number(themeId),
    });

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
    expect(html).toContain(">前回は延期になった</textarea>");
    // 重要度は既定が 2。1 を選んでいるので、初期値を渡し忘れると 2 が選ばれる
    expect(html).toContain('<option value="1" selected="">1</option>');
    // 対象は1つの <select>。3列のうち埋まっている1列から "theme:1" の形を組み立てる
    expect(html).toContain(`<option value="theme:${themeId}" selected="">`);
    expect(html).not.toContain(`<option value="stock:${stockId}" selected="">`);
    expect(html).not.toContain('<option value="market:JP" selected="">');
  });

  it("対象の選択肢は、テーマ名順・市場ティッカー順に並ぶ", async () => {
    // テーマと銘柄はこの画面では選択肢にしか出ない。作った順と並び順がずれる
    // 題材にする。「半導体」「防衛」は、DBの照合順序がどれでも前後が入れ替わらない
    // 2語（`app/stocks/[id]/page.test.ts` に選んだ経緯がある）
    await createTheme("防衛");
    await createTheme("半導体");
    // 並び順の題材なので、**2件とも**ティッカーと名前を明示する
    await createStock(stockInput({ ticker: "7203", name: "トヨタ自動車" }));
    await createStock(stockInput({ ticker: "6758", name: "ソニーグループ" }));
    const id = await addEvent();

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    // 対象は1つの `<select>` に市場・テーマ・銘柄をまとめている。
    // `<optgroup>` で絞ると、問い合わせ1本ぶんの並びだけを見られる
    expect(htmlOf(html, 'optgroup[label="テーマ"] option')).toEqual([
      "半導体",
      "防衛",
    ]);
    expect(htmlOf(html, 'optgroup[label="銘柄"] option')).toEqual([
      "JP 6758 ソニーグループ",
      "JP 7203 トヨタ自動車",
    ]);
  });

  it("削除の確認は、消すイベントの題名を出す", async () => {
    const id = await addEvent({ title: "半導体関連の決算発表" });

    const html = await render(() => Page({ params: Promise.resolve({ id }) }));

    expect(html).toContain(
      'data-confirm="「半導体関連の決算発表」を削除する。取り消せない。"',
    );
  });
});
