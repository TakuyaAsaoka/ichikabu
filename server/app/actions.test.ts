import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db";
import {
  auditLog,
  event,
  stock,
  theme,
  themeStock,
  user,
} from "../src/db/schema";
import { seedUser } from "../src/db/seed-user";
import {
  createEvent,
  createStock,
  createTheme,
  createThemeStock,
} from "../src/db/write";
import { resetDatabase } from "../test/helpers";
import { eventInput, stockInput } from "../test/inputs";
import { PASSWORD, redirectedTo, signInAs } from "../test/render-page";
import {
  addEvent,
  editEvent,
  removeEvent,
  removeStock,
  removeTheme,
  removeThemeStock,
} from "./actions";

// next/cache も Next.js のリクエストの中でしか動かない。next/headers と
// ADMIN_EMAIL の差し替えは `test/setup.ts` が全ファイルぶん行うが、これはこの1本
// でしか要らないのでここに置く（Server Action を直に呼ぶのはこのテストだけ）。
// vi.mock は import より前に巻き上げられるので、上の import より後に書いてよい。
//
// 差し替え先を `() => {}` ではなく `vi.fn()` にしてある。空の関数だと、
// 呼ばれたことも渡した値も誰も見ないため、`app/actions.ts` から
// `revalidatePath("/")` を消しても全件が緑のまま通る（Issue #149 で実測）
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Server Action を画面を通さず直接呼ぶ（設計書 §4）。画面から削除の欄を消すだけでは、
// 直接POSTされる経路が塞がっているかを判定できない。
// ADMIN は `test/setup.ts` が入れた `Admin@Example.com` と同じ人を指す
// （seedUser が小文字にして入れるため、大文字違いで同じ人になる）
const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}

/** 削除の対象を1件ずつ作る。作るのは write 層で、Server Action の権限判定を通さない */
async function seedTargets(): Promise<void> {
  await createStock(stockInput());
  await createTheme("ドローン");
  await createThemeStock(1, 1);
  await createEvent(
    eventInput({
      title: "日銀の金融政策決定会合",
      shortLabel: "日銀",
      startDate: "2026-03-31",
      market: "JP",
    }),
  );
}

beforeEach(async () => {
  await resetDatabase();
  await seedUser(ADMIN, PASSWORD);
  await seedUser(EDITOR, PASSWORD);
});

// 削除は取り返せないため管理者に限る（設計書 §2）。
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

/** イベントの入力欄。`id` を足せば編集、足さなければ登録に使える */
const eventFields = {
  title: "決算発表",
  shortLabel: "7203決算",
  startDate: "2026-05-08",
  importance: "3",
  target: "stock:1",
};

/**
 * 画面の作り直し（`revalidatePath("/")`）を見る2本。
 *
 * 12本すべてが `app/actions.ts` の `action()` を通るので全部を並べる必要は無いが、
 * **行き先のあるものと無いものは分けて見る。** 片方だけだと、次のどちらかを
 * 緑のまま通す（どちらも Issue #149 で実測）。
 *
 * | 壊し方 | 見逃す側 |
 * |---|---|
 * | `revalidatePath()` が `redirect()` の後ろへ移る | 行き先の無い1本だけで見た場合 |
 * | `revalidatePath()` が `if (options.redirectTo)` の中へ入る | 行き先のある1本だけで見た場合 |
 *
 * `action()` の分かれ道は `adminOnly` と `redirectTo` の2つで、実在する
 * 組み合わせは3通り。3通り目（`adminOnly` のある削除）は下の
 * `describe("管理者")` で見る。`revalidated` の2本は管理者ではない人で走るので、
 * ここには入れられない
 */
const revalidated = [
  {
    label: "行き先のある編集",
    run: () =>
      redirectedTo(() => editEvent(null, form({ ...eventFields, id: "1" }))),
  },
  {
    label: "行き先の無い登録",
    run: () => addEvent(null, form(eventFields)),
  },
];

// `action()` を通る操作はどれも `revalidatePath()` を呼ぶ。上のテストの呼び出しが
// 残っていると「このテストで呼ばれた」を見たことにならないので、毎回空にする
beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
});

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
    expect(await addEvent(null, form(eventFields))).toBeNull();
    expect(await db.select().from(event)).toHaveLength(2);
  });

  it("イベントを登録すると記録が残り、利用者IDがその入力者を指す", async () => {
    // 記録が残る経路は2つあり、こちらが画面の側（設計書 §5.2）。
    // 利用者IDは、テストが渡した文字列ではなく DB の user の行と突き合わせる
    const [{ id: editorId }] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, EDITOR));

    await addEvent(null, form(eventFields));

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(editorId);
    expect(rows[0].action).toBe("create");
    expect(rows[0].resourceType).toBe("event");
  });

  it("イベントを編集できて、イベントの画面へ戻る", async () => {
    // 限るのは削除だけ。編集にも requireAdmin を足すと、ここが落ちる。
    // 行き先まで見る。`rejects.toThrow(/NEXT_REDIRECT/)` の形は行き先を
    // 1文字も見ておらず、直したイベントが出ていない `/` へ飛ばす壊れ方が
    // 緑のまま通る（Issue #112 で実測）
    const to = await redirectedTo(() =>
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
    );
    expect(to).toBe("/events");

    const [row] = await db.select().from(event);
    expect(row.title).toBe("日銀の金融政策決定会合（変更後）");
  });

  it.each(revalidated)("$label でも画面が作り直される", async (target) => {
    await target.run();

    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

describe("管理者", () => {
  beforeEach(async () => {
    await seedTargets();
    await signInAs(ADMIN);
  });

  it("イベントを削除できて、イベントの画面へ戻る", async () => {
    // 拒み方だけを入れて全員を拒んでいないことを、ここで固定する。
    // 行き先まで見る理由は上と同じ
    const to = await redirectedTo(() => removeEvent(null, form({ id: "1" })));
    expect(to).toBe("/events");
    expect(await db.select().from(event)).toEqual([]);
  });

  it("削除でも画面が作り直される", async () => {
    // `revalidated` の表の3通り目。`adminOnly` の側だけ作り直しを飛ばす壊し方は、
    // 上の2本では緑のまま通る（Issue #149 で実測）
    await redirectedTo(() => removeEvent(null, form({ id: "1" })));

    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
