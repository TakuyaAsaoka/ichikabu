import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../test/helpers";

// Server Action を画面を通さず直接呼ぶ（設計書 §4）。画面から削除の欄を消すだけでは、
// 直接POSTされる経路が塞がっているかを判定できない
const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";
const PASSWORD = "correct-horse-battery-staple";

// app/actions.ts は読み込みの時点で ADMIN_EMAIL を読むため、読み込む前に入れる。
// ここで入れると、テストの結果が .env.local の中身に左右されなくなる。
// 大文字を混ぜてあるのは、seedUser がメールアドレスを小文字にして入れるためで、
// 揃えずに比べると設定に大文字が1つ入っただけで管理者が誰も居なくなる。
// stubEnv で入れるのは、テストファイルをまたいで値を持ち越さないため
vi.stubEnv("ADMIN_EMAIL", "Admin@Example.com");
afterAll(() => {
  vi.unstubAllEnvs();
});

// next/headers と next/cache は Next.js のリクエストの中でしか動かない。
// セッションだけは差し替えず、本物の Better Auth のトークンを headers に載せる
const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { auth } = await import("../src/auth");
const { db } = await import("../src/db");
const { event, holding, stock, theme, themeStock } = await import(
  "../src/db/schema"
);
const { seedUser } = await import("../src/db/seed-user");
const {
  addEvent,
  addHolding,
  editEvent,
  removeEvent,
  removeHolding,
  removeStock,
  removeTheme,
  removeThemeStock,
} = await import("./actions");

/** サインインして、以降の Server Action がそのセッションで動くようにする */
async function signInAs(email: string): Promise<void> {
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const token = res.headers.get("set-auth-token");
  if (!token) {
    throw new Error(`サインインできなかった: ${email}`);
  }
  requestHeaders.current = new Headers({ authorization: `Bearer ${token}` });
}

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}

/** 削除の対象を1件ずつ作る。作るのは write 層で、Server Action の権限判定を通さない */
async function seedTargets(): Promise<void> {
  const { createEvent, createStock, createTheme, createThemeStock } =
    await import("../src/db/write");

  await createStock({
    market: "JP",
    ticker: "7203",
    name: "トヨタ自動車",
    fiscalMonth: 3,
  });
  await createTheme("ドローン");
  await createThemeStock(1, 1);
  await createEvent({
    title: "日銀の金融政策決定会合",
    shortLabel: "日銀",
    startDate: "2026-03-31",
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

beforeEach(async () => {
  await resetDatabase();
  await seedUser(ADMIN, PASSWORD);
  await seedUser(EDITOR, PASSWORD);
});

// 削除は取り返せないため管理者に限る（設計書 §2）。保有だけは本人しか消せない行なので
// 含めない（app/actions.ts の removeHolding の注記を参照）。
//
// 欄の名前は英語にする。it.each のタイトル差し込み（`$label`）が拾うのは半角英数の
// 欄名だけで、日本語にすると `$名前` が文字のまま出て、4件のうちどれが落ちたのか
// 出力から分からなくなる（実測）
const adminOnlyDeletes = [
  {
    label: "銘柄",
    run: () => removeStock(null, form({ id: "1" })),
    remaining: () => db.select().from(stock),
  },
  {
    label: "テーマ",
    run: () => removeTheme(null, form({ id: "1" })),
    remaining: () => db.select().from(theme),
  },
  {
    label: "テーマ所属",
    run: () => removeThemeStock(null, form({ themeId: "1", stockId: "1" })),
    remaining: () => db.select().from(themeStock),
  },
  {
    label: "イベント",
    run: () => removeEvent(null, form({ id: "1" })),
    remaining: () => db.select().from(event),
  },
];

describe("管理者ではない入力者", () => {
  beforeEach(async () => {
    await seedTargets();
    await signInAs(EDITOR);
  });

  it.each(adminOnlyDeletes)("$label を削除できない", async (target) => {
    expect(await target.run()).toBe("削除できるのは管理者だけ");
    expect(await target.remaining()).toHaveLength(1);
  });

  it("イベントを登録できる", async () => {
    expect(
      await addEvent(
        null,
        form({
          title: "決算発表",
          shortLabel: "7203決算",
          startDate: "2026-05-08",
          importance: "3",
          target: "stock:1",
        }),
      ),
    ).toBeNull();
    expect(await db.select().from(event)).toHaveLength(2);
  });

  it("イベントを編集できる", async () => {
    // 限るのは削除だけ。編集にも requireAdmin を足すと、ここが落ちる
    await expect(
      editEvent(
        null,
        form({
          id: "1",
          title: "日銀の金融政策決定会合（変更後）",
          shortLabel: "日銀",
          startDate: "2026-04-28",
          importance: "3",
          target: "market:JP",
        }),
      ),
      // 成功すると redirect("/") が例外を投げる
    ).rejects.toThrow(/NEXT_REDIRECT/);

    const [row] = await db.select().from(event);
    expect(row.title).toBe("日銀の金融政策決定会合（変更後）");
  });

  it("自分で足した保有を自分で外せる", async () => {
    // 保有は本人しか消せない行で、管理者に限ると誰も消せなくなる。
    // ここが「4つだけを管理者に限る」判断を固定している
    expect(await addHolding(null, form({ stockId: "1" }))).toBeNull();
    expect(await db.select().from(holding)).toHaveLength(1);

    // 成功すると redirect("/") が例外を投げる
    await expect(removeHolding(null, form({ stockId: "1" }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(await db.select().from(holding)).toEqual([]);
  });
});

describe("管理者", () => {
  beforeEach(async () => {
    await seedTargets();
    await signInAs(ADMIN);
  });

  it("イベントを削除できる", async () => {
    // 拒み方だけを入れて全員を拒んでいないことを、ここで固定する。
    // 成功すると redirect("/") が例外を投げる
    await expect(removeEvent(null, form({ id: "1" }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(await db.select().from(event)).toEqual([]);
  });
});
