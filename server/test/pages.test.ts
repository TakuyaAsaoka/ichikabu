import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import Audit from "../app/audit/page";
import Contributions from "../app/contributions/page";
import EventEdit from "../app/events/[id]/page";
import Events from "../app/events/page";
import { LINKS } from "../app/nav";
import Home from "../app/page";
import SignIn from "../app/signin/page";
import Status from "../app/status/page";
import StockEdit from "../app/stocks/[id]/page";
import ThemeEdit from "../app/themes/[id]/page";
import ThemeStockRemove from "../app/themes/[id]/stocks/[stockId]/page";
import { auth } from "../src/auth";
import { seedUser } from "../src/db/seed-user";
import {
  createEvent,
  createStock,
  createTheme,
  createThemeStock,
} from "../src/db/write";
import { entriesOf, idOf, resetDatabase } from "./helpers";
import {
  expectNotFound,
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "./render-page";
import { requestHeaders } from "./setup";

// ADMIN は `test/setup.ts` が入れた `Admin@Example.com` と同じ人を指す
// （`seedUser` が小文字にして入れるため、大文字違いで同じ人になる）
const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

/** サインインして、以降の描画がそのセッションで動くようにする */
async function signIn(email: string): Promise<void> {
  requestHeaders.current = await signInAs(auth.handler, email);
}

async function addStock(ticker = "7203", name = "トヨタ自動車") {
  return idOf(
    await createStock({ market: "JP", ticker, name, fiscalMonth: 3 }),
  );
}

async function addTheme(name = "半導体") {
  return idOf(await createTheme(name));
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
 * 銘柄とテーマのIDをずらす。
 *
 * `resetDatabase` が採番を1に戻すため、素直に1件ずつ作ると銘柄もテーマも
 * IDが 1 になる。テーマ所属の画面は2つのIDを扱うので、同じ値のままだと
 * 入れ替えても区別が付かない
 */
async function shiftStockIds(): Promise<void> {
  await addStock("6758", "ソニーグループ");
}

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
  /**
   * 管理者だけが開ける画面。入力者でサインインすると描けないため、
   * 下の検査は管理者で開き、「入力者に監査ログの行き先を出さない」からは外す。
   * 入力者を追い返すこと自体は `app/audit/page.test.ts` が見ている
   */
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
      await shiftStockIds();
      const stockId = await addStock();
      const id = await addTheme();
      // 所属が作れなかったら、そこで落とす（画面が空になって黙って緑にならない）
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
            params: Promise.resolve({ id: "abc", stockId: MISSING }),
          }),
      },
      {
        why: "数でない銘柄ID",
        open: () =>
          ThemeStockRemove({
            params: Promise.resolve({ id: MISSING, stockId: "abc" }),
          }),
      },
      {
        why: "無い組み合わせ",
        open: () =>
          ThemeStockRemove({
            params: Promise.resolve({ id: MISSING, stockId: MISSING }),
          }),
      },
      // 下の2件は、問い合わせの `and` から片方の条件を落としたときに落ちる。
      // 「所属が1件も無い」だけでは、条件を落としても行が見つからず緑のまま通る
      {
        why: "別の銘柄が所属しているテーマ",
        open: async () => {
          const other = await addStock("6758", "ソニーグループ");
          const stockId = await addStock();
          const id = await addTheme();
          entriesOf(await createThemeStock(Number(id), Number(other)));
          return ThemeStockRemove({ params: Promise.resolve({ id, stockId }) });
        },
      },
      {
        why: "その銘柄が所属している別のテーマ",
        open: async () => {
          await shiftStockIds();
          const stockId = await addStock();
          const belonging = await addTheme();
          const id = await addTheme("防衛");
          entriesOf(await createThemeStock(Number(belonging), Number(stockId)));
          return ThemeStockRemove({ params: Promise.resolve({ id, stockId }) });
        },
      },
    ],
  },
];

/** サインインが要る画面。追い返しと `Nav` はここが対象 */
const GUARDED = SCREENS.filter((screen) => !screen.signedOut);

/** 描いたHTMLから `<h1>` の中身を取り出す */
const headingOf = (html: string) => /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1];

/** 描いたHTMLから、その行き先へのリンクの名前を取り出す */
const navLabelOf = (html: string, href: string) =>
  new RegExp(`<a [^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`).exec(html)?.[1];

/**
 * `app/nav.tsx` の行き先と、着いた先の画面を組にしたもの。
 * 表の `heading` は使わず、画面を描いて出てきた文字どうしを比べる
 */
const NAV_SCREENS = LINKS.map((link) => {
  const dir = link.href === "/" ? "." : link.href.slice(1);
  const screen = SCREENS.find((candidate) => candidate.dir === dir);
  if (!screen) {
    throw new Error(`app/nav.tsx の ${link.href} に当たる画面が上の表に無い`);
  }
  return { ...link, dir, open: screen.open };
});

/**
 * ナビに出るべき画面。入力者も開けて、IDを受け取らない画面がこれに当たる。
 * IDを受け取る画面は開くのに行が要るので、行き先として並べられない
 */
const NAVIGABLE = GUARDED.filter(
  (screen) => !screen.adminOnly && !screen.dir.includes("["),
);

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
    // 位置はこのファイルから決める。`process.cwd()` に頼ると、`server/` 以外から
    // 起動したときに無いディレクトリを見て落ちる
    const dirs = readdirSync(new URL("../app", import.meta.url), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((path) => basename(path) === "page.tsx")
      .map(dirname)
      .sort();

    expect(dirs).toEqual(SCREENS.map((screen) => screen.dir).sort());
  });

  it("IDを受け取る画面には、見つからない扱いの検査がある", () => {
    // 画面を数え合わせるだけでは、行を足したときの `notFound` の書き忘れが残る
    // 空の配列も書き忘れとして数える。`!screen.notFound` だけだと
    // `notFound: []` が素通りし、検査が1本も走らないまま緑になる
    const missing = SCREENS.filter(
      (screen) => screen.dir.includes("[") && !screen.notFound?.length,
    );

    expect(missing.map((screen) => screen.dir)).toEqual([]);
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
      expect(headingOf(html)).toBe(heading);
    },
  );

  it("ナビの行き先は、入力者が開けてIDの要らない画面と1対1", () => {
    // 画面を1枚足してナビに入れ忘れると、誰もそこへ行けない。
    // `LINKS` から1本消しても、`LINKS` だけを見る検査は数が減るだけで
    // 通ってしまうため、表と数え合わせる
    expect(NAV_SCREENS.map((screen) => screen.dir).sort()).toEqual(
      NAVIGABLE.map((screen) => screen.dir).sort(),
    );
  });

  it.each(NAV_SCREENS)(
    "$href の見出しは、`app/nav.tsx` のリンク名「$label」と同じ",
    async ({ href, label, open }) => {
      // リンクの名前と着いた先の名前が違うと、押して着いたのかどうかが分からない
      // （Issue #122）。同じ画面のHTMLから両方を取り出して比べるので、
      // 片方だけ直すと落ちる。見出しの文字列そのものは上の表が押さえており、
      // そちらが空でないことも見ているので、両方が空で揃う抜け道は無い
      await signIn(EDITOR);

      const html = await render(open);

      expect(navLabelOf(html, href)).toBe(label);
      expect(headingOf(html)).toBe(label);
    },
  );

  it("監査ログのリンク名も、着いた先の見出しと同じ", async () => {
    // 監査ログのリンクは管理者にだけ出すため `LINKS` の外にある。
    // 上の繰り返しから漏れるので、5本目としてここで見る。
    // リンクは入力者に出さないので、リンクの側も管理者で開く
    await signIn(ADMIN);

    const linkSource = await render(Home);
    const destination = await render(Audit);

    expect(headingOf(destination)).toBeTruthy();
    expect(navLabelOf(linkSource, "/audit")).toBe(headingOf(destination));
  });

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
      // どちらもここで落ちる。行き先の一覧そのものは上の2件が見ている
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

      await expectNotFound(() => render(open));
    },
  );
});
