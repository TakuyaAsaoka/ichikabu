import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/db";
import { record } from "../../../src/db/audit";
import { event } from "../../../src/db/schema";
import { seedUser } from "../../../src/db/seed-user";
import {
  createEvent,
  createStock,
  createTheme,
  updateEvent,
} from "../../../src/db/write";
import { htmlOf } from "../../../test/dom";
import { entriesOf, resetDatabase } from "../../../test/helpers";
import { eventInput } from "../../../test/inputs";
import { PASSWORD, render, signInAs } from "../../../test/render-page";
import Page from "./page";

const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

type EventInput = Parameters<typeof createEvent>[0];

/** 日経平均を対象にしたイベントの入力。対象の3列は1つだけ埋める（全体設計書 §5） */
function toInput(shortLabel: string, startDate = "2026-09-01"): EventInput {
  return eventInput({
    title: `${shortLabel}の発表`,
    shortLabel,
    startDate,
    market: "JP",
  });
}

/** イベントを1件作る */
async function addEvent(shortLabel: string, startDate?: string) {
  return createEvent(toInput(shortLabel, startDate));
}

/** 銘柄を1件作る */
async function addStock(ticker: string, name: string) {
  return createStock({ market: "JP", ticker, name, fiscalMonth: 3 });
}

/** 各テストの前に作り直す利用者のID。記録に残す人の出どころ */
const userIds = { admin: "", editor: "" };

beforeEach(async () => {
  await resetDatabase();
  userIds.admin = (await seedUser(ADMIN, PASSWORD)).userId;
  userIds.editor = (await seedUser(EDITOR, PASSWORD)).userId;
});

// 追い返しと `Nav` の出し分けは `test/pages.test.ts` の表が全画面ぶん見ている。
// ここに置くのは、この画面にしか無い「入れた人」の出し方だけにする
describe("イベントの画面", () => {
  it("イベント一覧は開始日順に並ぶ", async () => {
    // 作った順と開始日順がずれる題材にする。同じだと `orderBy(event.startDate)`
    // が落ちても緑のまま通る。
    // 4件入れるのは、2件だと落としたときも順番が合ってしまうことがあるため。
    // 一覧の問い合わせはテーマと銘柄を外部結合しており、`ORDER BY` が無いと
    // 結合の作りが返す順（作った順でも開始日順でもない）になる。
    // 2件だとその順がたまたま開始日順と一致した（実測）
    for (const [shortLabel, startDate] of [
      ["CPI", "2026-09-01"],
      ["雇用統計", "2026-08-01"],
      ["日銀会合", "2026-12-01"],
      ["GDP", "2026-07-01"],
    ]) {
      await addEvent(shortLabel, startDate);
    }
    await signInAs(EDITOR);

    const html = await render(Page);

    // 行の先頭は開始日。ここで見たいのは並び順だけなので先頭だけを比べる。
    // 行の中身は、この下の「入れた人が名前で出る」以降が見ている
    expect(
      htmlOf(html, "li").map((row) => row.slice(0, "2026-08-01".length)),
    ).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-12-01"]);
  });

  it("PC で1件を1行に並べる列の数と、見出しの位置が、行の項目と合っている", async () => {
    // 列の数は包みの `lg:grid-cols-[...]` に書き、行の項目とは別の場所にある（#172）。
    // 項目を足して列を足し忘れてもエラーにならず、1件が2段に折れるだけになる。
    // jsdom はレイアウトを計算しないので、見た目では気づけない。数を突き合わせる。
    // 非アクティブのバッジは名称と同じ枠に入れてあるので、付いても項目は増えない
    await db.insert(event).values({
      title: "日本銀行 金融政策決定会合",
      shortLabel: "日銀会合",
      startDate: "2026-10-01",
      importance: 2,
      market: "JP",
      active: false,
    });
    await signInAs(EDITOR);

    const html = await render(Page);

    // 列は `_` で区切って書く（`minmax(0,2fr)` の中に `_` は入らない）
    const columns = html.match(/lg:grid-cols-\[([^\]]+)\]/)?.[1].split("_");
    expect(columns).toBeDefined();
    const head = htmlOf(html, "section > div > [aria-hidden] > *");
    expect(head).toHaveLength(columns?.length ?? 0);
    // 日付は要素で包まず、行の先頭の文字のまま置いている（1つ上の検査が読むため）
    const cells = htmlOf(html, "li > *");
    expect(cells.length + 1).toBe(columns?.length);
    // 数だけでなく、見出しの文字が行の同じ列の中身を指していることも見る。
    // 行の項目を並べ替えて見出しを直し忘れると、ここで赤くなる
    expect(head.indexOf("出典")).toBe(
      cells.findIndex((cell) => cell.includes("出典: ")) + 1,
    );
    expect(head.indexOf("入力")).toBe(
      cells.findIndex((cell) => cell.includes("入力: ")) + 1,
    );
  });

  it("登録フォームは2つとも閉じて描かれ、それぞれの操作から開く", async () => {
    // 開くとまず一覧が見え、フォームは登録するときだけ開く（#165）。
    // イベントのフォームは10欄あり、開いたまま描くと一覧が画面の下へ押しやられる
    await signInAs(EDITOR);

    const html = await render(Page);

    // 全体の数も見る。閉じた中の数だけだと、フォームを丸ごと落としても気づけない
    expect(html.match(/<form\b/g)).toHaveLength(2);
    expect(htmlOf(html, "details:not([open]) form")).toHaveLength(2);
    // 操作の名前と、開いて出るフォームの組み合わせ。そのフォームにしか無い入力の名前で見る
    const labelOf = (form: string) =>
      htmlOf(html, `details:not([open]):has(${form}) > summary > span`);
    expect(labelOf('input[name="shortLabel"]')).toEqual(["イベントを登録"]);
    expect(labelOf('textarea[name="rows"]')).toEqual(["まとめて登録"]);
  });

  it("登録フォームの対象は、テーマ名順・市場ティッカー順に並ぶ", async () => {
    // テーマと銘柄はこの画面では選択肢にしか出ない。作った順と並び順がずれる
    // 題材にする。「半導体」「防衛」は、DBの照合順序がどれでも前後が入れ替わらない
    // 2語（`app/stocks/[id]/page.test.ts` に選んだ経緯がある）
    await createTheme("防衛");
    await createTheme("半導体");
    await addStock("7203", "トヨタ自動車");
    await addStock("6758", "ソニーグループ");
    await signInAs(EDITOR);

    const html = await render(Page);

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

  it("非アクティブの行にはバッジが付き、アクティブな行には付かない", async () => {
    // 非アクティブの行はアプリに出ない。一覧でそれが分かる場所は他に無い
    // （公表予定の非アクティブ化 設計書 §4）。#161 で文字の前置きからバッジに変えた。
    //
    // **アクティブな行に出ないことまで見る。** 出しっぱなしだと、印が
    // 非アクティブの行を1つも区別していないことになり、この検査が素通りする
    await addEvent("CPI");
    await signInAs(EDITOR);

    expect(await render(Page)).not.toContain("非アクティブ");

    // `active` は `createEvent` の入力（`EventInput`）に無く、DBの既定で true になる。
    // 非アクティブは `upsertMarketEvents` が裏返すものなので、ここは直に入れる
    // （`src/status.test.ts` の `addEvent` と同じ形）。
    // `EventInput` を展開しないのは、あちらの `market` が `string` で、
    // 列の側の `"JP" | "US" | "GLOBAL"` に入らないため
    await db.insert(event).values({
      title: "日本銀行 金融政策決定会合",
      shortLabel: "日銀会合",
      startDate: "2026-10-01",
      importance: 2,
      market: "JP",
      active: false,
    });

    expect(await render(Page)).toContain("非アクティブ</span>");
  });

  it("入れた人が名前で出る", async () => {
    await record(userIds.editor, entriesOf(await addEvent("CPI")));
    await signInAs(EDITOR);

    expect(await render(Page)).toContain(EDITOR);
  });

  it("取り込みが入れたイベントは「取り込み」と出る", async () => {
    // 取り込みスクリプトは記録を残すが、操作した人は NULL になる
    await record(null, entriesOf(await addEvent("CPI")));
    await signInAs(EDITOR);

    const html = await render(Page);
    expect(html).toContain("取り込み");
    expect(html).not.toContain("記録なし");
  });

  it("記録の無いイベントは「記録なし」と出る", async () => {
    // 監査ログより前に入った行には記録が無い（`src/db/seed-event.ts` は
    // 記録を書かない）。取り込みが入れたことにすると、取り込みがやっていない
    // 登録を取り込みの手柄にする
    await addEvent("CPI");
    await signInAs(EDITOR);

    const html = await render(Page);
    expect(html).toContain("記録なし");
    expect(html).not.toContain("取り込み");
  });

  it("登録の記録だけを見る。更新の記録や別の対象の記録を入れた人にしない", async () => {
    // 対象を絞る2つの条件（`action='create'` と `resource_type='event'`）を
    // どちらも決定的に守る形にしてある。
    //
    // - テーマの登録の記録は resource_id が "1" で、イベントの id 1 と同じ文字列。
    //   `resource_type` の絞りを外すと、この記録がイベントの入力者として出る
    // - イベントには更新の記録だけを残す。`action` の絞りを外すと、
    //   直した人が入れた人として出る
    //
    // 「登録した人と更新した人を別にする」形にしないのは、`Map` が後勝ちで、
    // どちらが後に読まれるかをSQLが決めていないため。それだと壊しても
    // 緑になることがある
    await record(userIds.admin, entriesOf(await createTheme("半導体")));
    // 直すイベントのIDは登録の記録から取る。1 と書くと、採番が1から始まる
    // ことに頼ることになる。番号がずれると `updateEvent` は0件更新になり、
    // 記録が1件も入らないまま緑になる（この検査が静かに効かなくなる）
    const [created] = entriesOf(await addEvent("CPI"));
    await record(
      userIds.admin,
      entriesOf(
        await updateEvent(Number(created.resourceId), {
          ...toInput("CPI"),
          importance: 2,
        }),
      ),
    );
    await signInAs(EDITOR);

    const html = await render(Page);
    expect(html).toContain("記録なし");
    expect(html).not.toContain(ADMIN);
  });
});
