import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../../test/helpers";
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
const { createEvent } = await import("../../src/db/write");
const { default: Page } = await import("./page");

type WriteResult = Awaited<ReturnType<typeof createEvent>>;

/** 書き込みが成功したことを判定し、記録を取り出す */
function entriesOf(result: WriteResult) {
  if (typeof result === "string") {
    throw new Error(`書き込みが失敗した: ${result}`);
  }
  return result;
}

/** 日経平均を対象にしたイベントを1件作る。対象の3列は1つだけ埋める（全体設計書 §5） */
async function addEvent(shortLabel: string): Promise<WriteResult> {
  return createEvent({
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
  });
}

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signIn(email: string): Promise<void> {
  requestHeaders.current = await signInAs(auth.handler, email);
}

beforeEach(async () => {
  await resetDatabase();
  await seedUser(ADMIN, PASSWORD);
  await seedUser(EDITOR, PASSWORD);
});

describe("イベントの画面", () => {
  it("サインインしていないとサインインの画面へ追い返される", async () => {
    requestHeaders.current = new Headers();

    expect(await redirectedTo(Page)).toBe("/signin");
  });

  it("入れた人が名前で出る", async () => {
    const { userId } = await seedUser(EDITOR, PASSWORD);
    await record(userId, entriesOf(await addEvent("CPI")));
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
