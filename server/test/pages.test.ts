import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { entriesOf, resetDatabase } from "./helpers";
import {
  notFoundOn,
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "./render-page";

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

const { auth } = await import("../src/auth");
const { seedUser } = await import("../src/db/seed-user");
const { createEvent, createStock, createTheme, createThemeStock } =
  await import("../src/db/write");

const { default: Home } = await import("../app/page");
const { default: Audit } = await import("../app/audit/page");
const { default: Contributions } = await import("../app/contributions/page");
const { default: Events } = await import("../app/events/page");
const { default: EventEdit } = await import("../app/events/[id]/page");
const { default: SignIn } = await import("../app/signin/page");
const { default: Status } = await import("../app/status/page");
const { default: StockEdit } = await import("../app/stocks/[id]/page");
const { default: ThemeEdit } = await import("../app/themes/[id]/page");
const { default: ThemeStockRemove } = await import(
  "../app/themes/[id]/stocks/[stockId]/page"
);

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signIn(email: string): Promise<void> {
  requestHeaders.current = await signInAs(auth.handler, email);
}

/** 書き込みが採番したIDを取り出す。1から始まることに頼らない */
function idOf(result: Awaited<ReturnType<typeof createStock>>): string {
  return entriesOf(result)[0].resourceId;
}

async function addStock(): Promise<string> {
  return idOf(
    await createStock({
      market: "JP",
      ticker: "7203",
      name: "トヨタ自動車",
      fiscalMonth: 3,
    }),
  );
}

async function addTheme(): Promise<string> {
  return idOf(await createTheme("半導体"));
}

async function addEvent(): Promise<string> {
  return idOf(
    await createEvent({
      title: "CPIの発表",
      shortLabel: "CPI",
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
    }),
  );
}

/** 採番されていないID。この番号の行はどのテストでも作らない */
const MISSING = "999";

/**
 * 管理画面1枚。`app/` 配下の `page.tsx` と1対1で並べる。
 *
 * 画面ごとの `page.test.ts` に写すと、ここが見る分だけで245行になる（討論で実測）。
 * 1枚足したときに書き忘れる形にしないため、下の「表に載っていない画面が無い」で
 * `app/` を数え合わせる（手書きの一覧にしない考えは `test/helpers.ts` の
 * `resetDatabase` と同じ）
 */
type Screen = {
  /** `app/` からの位置。`page.tsx` のあるディレクトリ。表の抜けを数えるのに使う */
  dir: string;
  /** 画面の見出し。`<h1>` の中身と1文字ずつ比べる */
  heading: string;
  /** 前提データを作ってから画面を描く */
  open: () => Promise<ReactNode>;
  /** 管理者だけが開ける画面。入力者は追い返される */
  adminOnly?: boolean;
  /** サインインしていない人に見せる画面。追い返しも `Nav` も無い */
  signedOut?: boolean;
  /** 見つからない扱いになるべき開き方。IDを受け取る画面だけ持つ */
  notFound?: { why: string; open: () => Promise<ReactNode> }[];
};

const SCREENS: Screen[] = [
  { dir: ".", heading: "銘柄とテーマ", open: Home },
  { dir: "audit", heading: "監査ログ", open: Audit, adminOnly: true },
  { dir: "contributions", heading: "貢献度", open: Contributions },
  { dir: "events", heading: "イベント", open: Events },
  {
    dir: "events/[id]",
    heading: "イベントを編集",
    open: async () =>
      EventEdit({ params: Promise.resolve({ id: await addEvent() }) }),
    notFound: [
      {
        why: "数でないID",
        open: () => EventEdit({ params: Promise.resolve({ id: "abc" }) }),
      },
      {
        why: "無いID",
        open: () => EventEdit({ params: Promise.resolve({ id: MISSING }) }),
      },
    ],
  },
  {
    dir: "signin",
    heading: "イチカブ 管理",
    open: () => SignIn({ searchParams: Promise.resolve({}) }),
    signedOut: true,
  },
  { dir: "status", heading: "状態", open: Status },
  {
    dir: "stocks/[id]",
    heading: "銘柄を編集",
    open: async () =>
      StockEdit({ params: Promise.resolve({ id: await addStock() }) }),
    notFound: [
      {
        why: "数でないID",
        open: () => StockEdit({ params: Promise.resolve({ id: "abc" }) }),
      },
      {
        why: "無いID",
        open: () => StockEdit({ params: Promise.resolve({ id: MISSING }) }),
      },
    ],
  },
  {
    dir: "themes/[id]",
    heading: "テーマを編集",
    open: async () =>
      ThemeEdit({ params: Promise.resolve({ id: await addTheme() }) }),
    notFound: [
      {
        why: "数でないID",
        open: () => ThemeEdit({ params: Promise.resolve({ id: "abc" }) }),
      },
      {
        why: "無いID",
        open: () => ThemeEdit({ params: Promise.resolve({ id: MISSING }) }),
      },
    ],
  },
  {
    dir: "themes/[id]/stocks/[stockId]",
    heading: "テーマ所属を外す",
    open: async () => {
      const stockId = await addStock();
      const id = await addTheme();
      entriesOf(await createThemeStock(Number(id), Number(stockId)));
      return ThemeStockRemove({ params: Promise.resolve({ id, stockId }) });
    },
    // 複合主キーなので2列とも見る。片方だけの判定にすると、もう片方が
    // integer 列に届いて 500 になる
    notFound: [
      {
        why: "数でないテーマID",
        open: () =>
          ThemeStockRemove({
            params: Promise.resolve({ id: "abc", stockId: "1" }),
          }),
      },
      {
        why: "数でない銘柄ID",
        open: () =>
          ThemeStockRemove({
            params: Promise.resolve({ id: "1", stockId: "abc" }),
          }),
      },
      {
        why: "無い組み合わせ",
        open: () =>
          ThemeStockRemove({
            params: Promise.resolve({ id: MISSING, stockId: MISSING }),
          }),
      },
    ],
  },
];

/** サインインが要る画面。追い返しと `Nav` はここが対象 */
const GUARDED = SCREENS.filter((screen) => !screen.signedOut);

/** 見つからない扱いの検査を、画面をまたいで1つずつ並べたもの */
const NOT_FOUND = SCREENS.flatMap((screen) =>
  (screen.notFound ?? []).map((testCase) => ({
    dir: screen.dir,
    ...testCase,
  })),
);

beforeEach(async () => {
  await resetDatabase();
  await seedUser(ADMIN, PASSWORD);
  await seedUser(EDITOR, PASSWORD);
});

describe("管理画面に共通の約束", () => {
  it("表に載っていない画面が無い", async () => {
    // 画面を足したとき、下の検査が黙って素通りしないようにする
    const dirs = readdirSync("app", { recursive: true, encoding: "utf8" })
      .filter((path) => path.endsWith("page.tsx"))
      .map(dirname)
      .sort();

    expect(dirs).toEqual(SCREENS.map((screen) => screen.dir).sort());
  });

  it.each(GUARDED)(
    "$dir はサインインしていないとサインインの画面へ追い返される",
    async ({ open }) => {
      requestHeaders.current = new Headers();

      expect(await redirectedTo(open)).toBe("/signin");
    },
  );

  it.each(SCREENS)(
    "$dir の見出しは「$heading」",
    async ({ open, heading, adminOnly, signedOut }) => {
      // サインインの画面は、サインイン済みで開くと `/` へ送られる
      if (signedOut) {
        requestHeaders.current = new Headers();
      } else {
        await signIn(adminOnly ? ADMIN : EDITOR);
      }

      // 見出しが消えても、同じ文字列が `Nav` のリンク名に残る画面がある。
      // `toContain(見出し)` だと消したことに気づけないため、中身を取り出して比べる
      const html = await render(open);
      expect(/<h1[^>]*>([^<]*)<\/h1>/.exec(html)?.[1]).toBe(heading);
    },
  );

  it.each(GUARDED.filter((screen) => !screen.adminOnly))(
    "$dir は入力者に監査ログへの行き先を出さない",
    async ({ open }) => {
      // 開いても追い返されるリンクを見せない
      await signIn(EDITOR);

      expect(await render(open)).not.toContain('href="/audit"');
    },
  );

  it.each(GUARDED)(
    "$dir は管理者に監査ログへの行き先を出す",
    async ({ open }) => {
      // `Nav` を呼び忘れた画面と、`Nav` に別のメールアドレスを渡した画面は、
      // どちらもここで落ちる。行き先の一覧そのものは `app/page.test.ts` が見る
      await signIn(ADMIN);

      expect(await render(open)).toContain('href="/audit"');
    },
  );

  it.each(NOT_FOUND)(
    "$dir は$whyを見つからない扱いにする",
    async ({ open }) => {
      // 数でないIDは integer 列に渡す前に弾く。渡すと型変換エラーで 500 になる。
      // 無いIDは、読めた行が無いまま画面を組み立てると 500 になる
      await signIn(EDITOR);

      expect(await notFoundOn(() => render(open))).toBe(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
    },
  );
});
