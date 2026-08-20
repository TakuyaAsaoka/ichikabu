import { beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, idOf, listItemsOf, resetDatabase } from "../../test/helpers";
import { PASSWORD, render, signInAs } from "../../test/render-page";

const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const { auth } = await import("../../src/auth");
const { record } = await import("../../src/db/audit");
const { seedUser } = await import("../../src/db/seed-user");
const { createEvent, createTheme, updateEvent } = await import(
  "../../src/db/write"
);
const { default: Page } = await import("./page");

type EventInput = Parameters<typeof createEvent>[0];

/** 日経平均を対象にしたイベントの入力。対象の3列は1つだけ埋める（全体設計書 §5） */
function toInput(shortLabel: string, startDate = "2026-09-01"): EventInput {
  return {
    title: `${shortLabel}の発表`,
    shortLabel,
    startDate,
    endDate: null,
    time: null,
    importance: 3,
    note: null,
    sourceUrl: null,
    sourceName: null,
    market: "JP",
    themeId: null,
    stockId: null,
  };
}

/** イベントを1件作る */
async function addEvent(shortLabel: string, startDate?: string) {
  return createEvent(toInput(shortLabel, startDate));
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
    // 日付が先になる回を後から作る。作った順と開始日順が同じ題材だと、
    // `orderBy(event.startDate)` が落ちても緑のまま通る
    const later = idOf(await addEvent("CPI", "2026-09-01"));
    const earlier = idOf(await addEvent("雇用統計", "2026-08-01"));
    await signIn(EDITOR);

    const html = await render(Page);

    expect(listItemsOf(html)).toEqual([
      `2026-08-01 ★3 雇用統計<span class="text-muted"> / JP / 雇用統計の発表 / 出典: 表示名なし / 入力: 記録なし</span> <a class="underline" href="/events/${earlier}">編集</a>`,
      `2026-09-01 ★3 CPI<span class="text-muted"> / JP / CPIの発表 / 出典: 表示名なし / 入力: 記録なし</span> <a class="underline" href="/events/${later}">編集</a>`,
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
