import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../../src/auth";
import { record } from "../../src/db/audit";
import { seedUser } from "../../src/db/seed-user";
import {
  createEvent,
  createStock,
  createTheme,
  updateEvent,
} from "../../src/db/write";
import { htmlOf } from "../../test/dom";
import { entriesOf, resetDatabase } from "../../test/helpers";
import { eventInput } from "../../test/inputs";
import { PASSWORD, render, signInAs } from "../../test/render-page";
import { requestHeaders } from "../../test/setup";
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

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signIn(email: string): Promise<void> {
  requestHeaders.current = await signInAs(auth.handler, email);
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
    await signIn(EDITOR);

    const html = await render(Page);

    // 行の先頭は開始日。ここで見たいのは並び順だけなので先頭だけを比べる。
    // 行の中身は、この下の「入れた人が名前で出る」以降が見ている
    expect(
      htmlOf(html, "li").map((row) => row.slice(0, "2026-08-01".length)),
    ).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-12-01"]);
  });

  it("登録フォームの対象は、テーマ名順・市場ティッカー順に並ぶ", async () => {
    // テーマと銘柄はこの画面では選択肢にしか出ない。作った順と並び順がずれる
    // 題材にする。「半導体」「防衛」は、DBの照合順序がどれでも前後が入れ替わらない
    // 2語（`app/stocks/[id]/page.test.ts` に選んだ経緯がある）
    await createTheme("防衛");
    await createTheme("半導体");
    await addStock("7203", "トヨタ自動車");
    await addStock("6758", "ソニーグループ");
    await signIn(EDITOR);

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

  it("入れた人が名前で出る", async () => {
    await record(userIds.editor, entriesOf(await addEvent("CPI")));
    await signIn(EDITOR);

    expect(await render(Page)).toContain(EDITOR);
  });

  it("取り込みが入れたイベントは「取り込み」と出る", async () => {
    // 取り込みスクリプトは記録を残すが、操作した人は NULL になる
    await record(null, entriesOf(await addEvent("CPI")));
    await signIn(EDITOR);

    const html = await render(Page);
    expect(html).toContain("取り込み");
    expect(html).not.toContain("記録なし");
  });

  it("記録の無いイベントは「記録なし」と出る", async () => {
    // 監査ログより前に入った行には記録が無い（`src/db/seed-event.ts` は
    // 記録を書かない）。取り込みが入れたことにすると、取り込みがやっていない
    // 登録を取り込みの手柄にする
    await addEvent("CPI");
    await signIn(EDITOR);

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
    await signIn(EDITOR);

    const html = await render(Page);
    expect(html).toContain("記録なし");
    expect(html).not.toContain(ADMIN);
  });
});
