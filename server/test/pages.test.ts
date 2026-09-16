import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Audit from "../app/(signed-in)/audit/page";
import Contributions from "../app/(signed-in)/contributions/page";
import EventEdit from "../app/(signed-in)/events/[id]/page";
import Events from "../app/(signed-in)/events/page";
import Shell from "../app/(signed-in)/layout";
import Home from "../app/(signed-in)/page";
import Status from "../app/(signed-in)/status/page";
import StockEdit from "../app/(signed-in)/stocks/[id]/page";
import ThemeEdit from "../app/(signed-in)/themes/[id]/page";
import ThemeStockRemove from "../app/(signed-in)/themes/[id]/stocks/[stockId]/page";
import { AUDIT, LINKS } from "../app/app-shell/nav";
import SignIn from "../app/signin/page";
import { seedUser } from "../src/db/seed-user";
import {
  createEvent,
  createStock,
  createTheme,
  createThemeStock,
} from "../src/db/write";
import { entriesOf, idOf, resetDatabase } from "./helpers";
import { eventInput } from "./inputs";
import {
  expectNotFound,
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "./render-page";
import { requestHeaders } from "./setup";

/**
 * 骨組みを描くときに「今いる画面」として渡すURL。
 *
 * サイドバーと下のタブは今いる画面を `usePathname()` で決める
 * （`app/app-shell/nav.tsx`）。この関数はプロバイダの外だと null を返すので、
 * テストが見たいURLを入れる形に差し替える。
 *
 * **`next/navigation` の他の関数は原物のまま残す。** `redirect()` と `notFound()` を
 * 差し替えると、追い返しと見つからない扱いの検査（`redirectedTo`・`expectNotFound`）が
 * 本物を見なくなる
 */
const pathname = { current: "/" };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  usePathname: () => pathname.current,
}));

// ADMIN は `test/setup.ts` が入れた `Admin@Example.com` と同じ人を指す
// （`seedUser` が小文字にして入れるため、大文字違いで同じ人になる）
const ADMIN = "admin@example.com";
const EDITOR = "editor@example.com";

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
    await createEvent(
      eventInput({
        title: "CPIの発表",
        shortLabel: "CPI",
        startDate: "2026-09-01",
        market: "JP",
      }),
    ),
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
   * この画面を開いているときのURL。骨組みに「今いる画面」として渡す。
   *
   * `dir` から作らず手で書く。IDを受け取る画面は具体的な番号が要るため。
   * 手で書いた値が `dir` と食い違っていないことは、下の
   * 「表のURLは画面の位置と合っている」が見る
   */
  path: string;
  /**
   * この画面にいるとき、骨組みで光るべき行き先（`aria-current="page"` が付く行）。
   *
   * 自分がその行き先そのものとは限らない。銘柄の編集（`/stocks/1`）は
   * `/`（銘柄とテーマ）から開くので、光るのは `/` の行。
   *
   * 骨組みの出ない画面（`signedOut`）は書かない。書いても読む所が無く、
   * 「ここを直せば何か変わる」と誤解されるため
   */
  current?: string;
  /**
   * 管理者だけが開ける画面。入力者でサインインすると描けないため、
   * 下の検査は管理者で開き、「入力者に監査ログの行き先を出さない」からは外す。
   * 入力者を追い返すこと自体は `app/(signed-in)/audit/page.test.ts` が見ている
   */
  adminOnly?: boolean;
  /** サインインしていない人に見せる画面。追い返しも骨組みも無い */
  signedOut?: boolean;
  /** 見つからない扱いになるべき開き方。IDを受け取る画面だけ持つ */
  notFound?: { why: string; open: () => Promise<ReactNode> }[];
};

const SCREENS: Screen[] = [
  {
    dir: "(signed-in)",
    heading: "銘柄とテーマ",
    open: Home,
    path: "/",
    current: "/",
  },
  {
    dir: "(signed-in)/audit",
    heading: "監査ログ",
    open: Audit,
    path: "/audit",
    current: "/audit",
    adminOnly: true,
  },
  {
    dir: "(signed-in)/contributions",
    heading: "貢献度",
    open: Contributions,
    path: "/contributions",
    current: "/contributions",
  },
  {
    dir: "(signed-in)/events",
    heading: "イベント",
    open: Events,
    path: "/events",
    current: "/events",
  },
  {
    dir: "(signed-in)/events/[id]",
    heading: "イベントを編集",
    path: "/events/1",
    // イベントの編集はイベントの画面から開く
    current: "/events",
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
    path: "/signin",
    open: () => SignIn({ searchParams: Promise.resolve({}) }),
    signedOut: true,
  },
  {
    dir: "(signed-in)/status",
    heading: "状態",
    open: Status,
    path: "/status",
    current: "/status",
  },
  {
    dir: "(signed-in)/stocks/[id]",
    heading: "銘柄を編集",
    path: "/stocks/1",
    // 銘柄の編集は銘柄とテーマの画面から開く
    current: "/",
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
    dir: "(signed-in)/themes/[id]",
    heading: "テーマを編集",
    path: "/themes/1",
    current: "/",
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
    dir: "(signed-in)/themes/[id]/stocks/[stockId]",
    heading: "テーマ所属を外す",
    path: "/themes/1/stocks/2",
    current: "/",
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

/** サインインが要る画面。追い返しと骨組みはここが対象 */
const GUARDED = SCREENS.filter((screen) => !screen.signedOut);

/** 描いたHTMLから `<h1>` の中身を取り出す */
const headingOf = (html: string) => /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1];

/**
 * 描いたHTMLから、その行き先へのリンクの名前を取り出す。
 *
 * 名前は `<span>` の中だけを見る。リンクにはアイコンの `<svg>` も入っており
 * （`app/app-shell/nav.tsx`）、`<a>` の中身を丸ごと返すと svg ごと拾う
 */
const navLabelOf = (html: string, href: string) =>
  new RegExp(`<a [^>]*href="${href}"[^>]*>[\\s\\S]*?<span[^>]*>([^<]*)</span>`)
    .exec(html)?.[1]
    ?.trim();

/**
 * 描いたHTMLから、今いる画面の印が付いたリンクの行き先を、出た順に取り出す。
 *
 * **属性の並び順に頼らない。** React は `aria-current` を `href` より前に書くため、
 * 「`href=` のあとに `aria-current=`」で探すと、印が正しく付いていても当たらない（実測）
 */
const currentHrefsOf = (html: string) =>
  [...html.matchAll(/<a ([^>]*)>/g)]
    .map((found) => found[1])
    .filter((attributes) => attributes.includes('aria-current="page"'))
    .map((attributes) => /href="([^"]*)"/.exec(attributes)?.[1]);

/**
 * 骨組み（`app/(signed-in)/layout.tsx`）を、そのURLにいる形で描く。
 *
 * レイアウトも非同期の関数なので、画面と同じ `render` で描ける。
 * 中身は空にする。骨組みだけを見たいので、画面のHTMLが混ざると
 * 取り出しがどちらを拾ったのか分からなくなる
 */
async function renderShell(path: string): Promise<string> {
  pathname.current = path;
  return render(() => Shell({ children: null }));
}

/** 骨組みが中身を出しているかを見るための目印 */
const CONTENT_MARK = "ここに画面が入る";

/**
 * 骨組みの行き先と、着いた先の画面を組にしたもの。
 * 表の `heading` は使わず、描いて出てきた文字どうしを比べる
 */
const NAV_SCREENS = [...LINKS, AUDIT].map((link) => {
  const screen = SCREENS.find((candidate) => candidate.path === link.href);
  if (!screen) {
    throw new Error(
      `app/app-shell/nav.tsx の ${link.href} に当たる画面が上の表に無い`,
    );
  }
  return {
    ...link,
    dir: screen.dir,
    open: screen.open,
    adminOnly: screen.adminOnly,
  };
});

/**
 * 骨組みに出るべき画面。IDを受け取らない画面がこれに当たる。
 * IDを受け取る画面は開くのに行が要るので、行き先として並べられない
 */
const NAVIGABLE = GUARDED.filter((screen) => !screen.dir.includes("["));

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
        await signInAs(adminOnly ? ADMIN : EDITOR);
      }

      // 見出しが消えても、同じ文字列が骨組みのリンク名に残る画面がある。
      // `toContain(見出し)` だと消したことに気づけないため、中身を取り出して比べる
      const html = await render(open);
      expect(headingOf(html)).toBe(heading);
    },
  );

  it("骨組みの行き先は、IDの要らない画面と1対1", () => {
    // 画面を1枚足して骨組みに入れ忘れると、誰もそこへ行けない。
    // `LINKS` から1本消しても、`LINKS` だけを見る検査は数が減るだけで
    // 通ってしまうため、表と数え合わせる
    expect(NAV_SCREENS.map((screen) => screen.dir).sort()).toEqual(
      NAVIGABLE.map((screen) => screen.dir).sort(),
    );
  });

  it.each(NAV_SCREENS)(
    "$href の見出しは、骨組みのリンク名「$label」と同じ",
    async ({ href, label, open, adminOnly }) => {
      // リンクの名前と着いた先の名前が違うと、押して着いたのかどうかが分からない
      // （Issue #122）。描いて出てきた文字どうしを比べるので、片方だけ直すと落ちる。
      // 見出しの文字列そのものは上の表が押さえており、そちらが空でないことも
      // 見ているので、両方が空で揃う抜け道は無い。
      // 監査ログは管理者にしか出ないため、この1本だけ管理者で描く
      await signInAs(adminOnly ? ADMIN : EDITOR);

      expect(navLabelOf(await renderShell("/"), href)).toBe(label);
      expect(headingOf(await render(open))).toBe(label);
    },
  );

  it("骨組みは中身をそのまま出す", async () => {
    // 画面ごとに呼ぶ形をやめたことで、「骨組みの入れ忘れ」の代わりに
    // 「骨組みが中身を飲み込む」が新しい壊れ方になった。しかも被害は9枚同時。
    // `{children}` を落としても、他の検査は骨組みだけを描いているので全部緑になる
    await signInAs(EDITOR);

    const html = await render(() =>
      Shell({ children: createElement("p", null, CONTENT_MARK) }),
    );

    expect(html).toContain(CONTENT_MARK);
  });

  it("骨組みもサインインしていないとサインインの画面へ追い返される", async () => {
    // 画面の側の追い返しとは別に、骨組みも自分で確かめる。
    // 外すとサインインしていない人にも行き先とアカウントのボタンが並ぶ
    requestHeaders.current = new Headers();

    expect(await redirectedTo(() => Shell({ children: null }))).toBe("/signin");
  });

  it("入力者の骨組みには監査ログへの行き先が出ない", async () => {
    // 開いても追い返されるリンクを見せない
    // （判定は `app/(signed-in)/audit/page.tsx` が自分でもう1度やる）
    await signInAs(EDITOR);

    expect(await renderShell("/")).not.toContain('href="/audit"');
  });

  it("管理者の骨組みには監査ログへの行き先が出る", async () => {
    await signInAs(ADMIN);

    expect(await renderShell("/")).toContain('href="/audit"');
  });

  it("サイドバーと下のタブは同じ行き先を持つ", async () => {
    // 片方にだけ足す形にすると、行き先を1つ増やしたときに
    // 端末によって行けたり行けなかったりする。
    // どちらも隠すのは CSS なので、HTMLには両方とも出る
    await signInAs(ADMIN);

    const html = await renderShell("/");
    const counts = [...LINKS, AUDIT].map(
      (link) => html.split(`href="${link.href}"`).length - 1,
    );

    expect(counts).toEqual([2, 2, 2, 2, 2]);
  });

  it("表のURLは画面の位置と合っている", () => {
    // `path` は手書きなので、`dir` と食い違ったまま下の「今いる画面の印」が
    // 緑になる道を塞ぐ。ルートグループ `(signed-in)` はURLに出ず、
    // `[id]` は1つの区切りに当たるものとして見る
    const mismatched = SCREENS.filter((screen) => {
      const pattern = screen.dir
        .replace(/\([^)]*\)\/?/g, "")
        .replace(/\[[^\]]+\]/g, "[^/]+");
      return !new RegExp(`^/${pattern}$`).test(screen.path);
    });

    expect(mismatched.map((screen) => screen.dir)).toEqual([]);
  });

  it("サインインが要る画面には、光るべき行き先が書いてある", () => {
    // `current` は任意にしてあるので、書き忘れると下の「今いる画面の印」が
    // `undefined` と比べる形になり、印が1つも付かなくても緑になる
    const missing = GUARDED.filter((screen) => !screen.current);

    expect(missing.map((screen) => screen.dir)).toEqual([]);
  });

  it("サインインが要る画面は全部 (signed-in) の下にある", () => {
    // 骨組みはこのルートグループの `layout.tsx` が付ける。外に置いた画面は
    // 骨組みも `requireSession()` の追い返しも無いまま増える。
    // `signedOut` の画面は逆に、この下にあってはいけない（骨組みが付いてしまう）
    const misplaced = SCREENS.filter(
      (screen) => screen.dir.startsWith("(signed-in)") === !!screen.signedOut,
    );

    expect(misplaced.map((screen) => screen.dir)).toEqual([]);
  });

  it.each(GUARDED)(
    "$dir にいるとき、骨組みは $current の行だけを今いる画面にする",
    async ({ path, current }) => {
      // 「今いる画面」を前方一致だけで決めると、`/` がどのURLにも当たって
      // どこに居ても「銘柄とテーマ」が光る（討論で実測して見つけた）。
      // 数と行き先の両方を見るので、印が消えても増えても落ちる。
      // 監査ログの行も見たいので管理者で描く
      await signInAs(ADMIN);

      const html = await renderShell(path);

      // サイドバーと下のタブに1つずつ。数と行き先を一度に見るので、
      // 印が消えても増えても違う行に付いても落ちる
      expect(currentHrefsOf(html)).toEqual([current, current]);
    },
  );

  it.each(NOT_FOUND)(
    "$dir は$whyを見つからない扱いにする",
    async ({ open }) => {
      // 数でないIDは integer 列に渡す前に弾く。渡すと型変換エラーで 500 になる。
      // 無いIDは、読めた行が無いまま画面を組み立てると 500 になる
      await signInAs(EDITOR);

      await expectNotFound(() => render(open));
    },
  );
});
