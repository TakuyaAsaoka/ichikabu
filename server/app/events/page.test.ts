import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, resetDatabase } from "../../test/helpers";
import {
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "../../test/render-page";

const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

// 画面は読み込みの時点で ADMIN_EMAIL を読むため、読み込む前に入れる
// （`app/audit/page.test.ts` と同じ理由）
vi.stubEnv("ADMIN_EMAIL", "Admin@Example.com");
afterAll(() => {
  vi.unstubAllEnvs();
});

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
function toInput(shortLabel: string): EventInput {
  return {
    title: `${shortLabel}の発表`,
    shortLabel,
    startDate: "2026-09-01",
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
async function addEvent(shortLabel: string) {
  return createEvent(toInput(shortLabel));
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

describe("イベントの画面", () => {
  it("サインインしていないとサインインの画面へ追い返される", async () => {
    requestHeaders.current = new Headers();

    expect(await redirectedTo(Page)).toBe("/signin");
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

  it("入力者には監査ログへの行き先が出ない", async () => {
    // 行き先は `app/nav.tsx` が出す。開いても追い返されるリンクを見せない
    await signIn(EDITOR);

    expect(await render(Page)).not.toContain('href="/audit"');
  });

  it("管理者には監査ログへの行き先が出る", async () => {
    await signIn(ADMIN);

    expect(await render(Page)).toContain('href="/audit"');
  });
});
