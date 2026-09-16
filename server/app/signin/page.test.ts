import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../src/db/seed-user";
import { resetDatabase } from "../../test/helpers";
import {
  PASSWORD,
  redirectedTo,
  render,
  signInAs,
} from "../../test/render-page";
import { requestHeaders } from "../../test/setup";
import { stripComments } from "../../test/source";
import Page from "./page";

const EDITOR = "editor@example.com";

/** クエリ文字列の `error` を渡して画面を描く */
function open(error?: string | string[]) {
  return () => Page({ searchParams: Promise.resolve({ error }) });
}

/**
 * `app/` の画面ごとに、`<h1>` に書いてある class を集める（[画面の位置, classの並び]）。
 *
 * 描いたHTMLではなくソースを読む。class は Tailwind の指定そのままで出るが、
 * 「他の画面と同じ値か」を見るには、9画面ぶんを描いて集めるより読むほうが速い。
 *
 * **コメントを取り除いてから探す**（`test/source.ts`）。取り除かないと、
 * 見出しの class を説明したコメントのほうを読んでしまい、本物を他の画面と
 * 同じ値に戻しても緑のまま通る
 */
function headingClasses(): [string, string[]][] {
  const appDir = new URL("../", import.meta.url);

  return readdirSync(appDir, { recursive: true, encoding: "utf8" })
    .filter((file) => basename(file) === "page.tsx")
    .map((file) => [
      dirname(file),
      /<h1 className="([^"]*)"/
        .exec(stripComments(readFileSync(new URL(file, appDir), "utf8")))?.[1]
        ?.split(/\s+/) ?? [],
    ]);
}

beforeEach(async () => {
  await resetDatabase();
  await seedUser(EDITOR, PASSWORD);
  requestHeaders.current = new Headers();
});

describe("サインインの画面", () => {
  it("サインイン済みで開くと管理画面へ戻される", async () => {
    await signInAs(EDITOR);

    expect(await redirectedTo(open())).toBe("/");
  });

  it("見出しに、他の画面と同じ型を使っていない", () => {
    const classes = headingClasses();
    // 取り出しが1つでも空になると、下の比較が黙って緑になる
    expect(classes.filter(([, names]) => names.length === 0)).toEqual([]);
    // サインインの画面が数え上げから外れても、同じく黙って緑になる。
    // 置き場所を移す変更（ルートグループへの移動など）で実際に起きうる
    expect(classes.map(([dir]) => dir)).toContain("signin");

    const signin = new Set(
      classes.find(([dir]) => dir === "signin")?.[1] ?? [],
    );

    // 「9画面が `text-xl font-bold` であること」は求めない。求めるのは
    // 「signin の見出しが、他のどれかの型をそのまま含んでいないこと」だけ。
    // 他の画面の見出しを将来変えても、この検査は巻き込まれない。
    //
    // 一致ではなく含むかで見る。一致だけを見ると、他の画面の型に1つ足した
    // `text-xl font-bold text-center` が素通りする（Issue の検証は落ちる）
    expect(
      classes
        .filter(
          ([dir, names]) =>
            dir !== "signin" && names.every((name) => signin.has(name)),
        )
        .map(([dir]) => dir),
    ).toEqual([]);
  });

  it("見出しと欄は、幅を絞って中央に寄せた包みの中にある", async () => {
    // CSS は当たらないので、包みが持っている class を見る。
    // `app/layout.tsx` の <main>（max-w-3xl）より内側で、もう1段絞って中央に寄せる
    const root =
      /^<\w+ class="([^"]*)"/.exec(await render(open()))?.[1]?.split(/\s+/) ??
      [];

    expect(root).toContain("mx-auto");
    // `max-w-none`・`max-w-full` は幅を絞らない。前置きだけで見ると素通りする
    expect(
      root.filter(
        (name) =>
          name.startsWith("max-w-") &&
          name !== "max-w-none" &&
          name !== "max-w-full",
      ),
    ).not.toEqual([]);
  });

  it("縦の中央寄せが引いている 3rem は、<main> の上下の余白と同じ", () => {
    // `app/signin/page.tsx` の `min-h-[calc(100dvh-3rem)]` は、
    // `app/layout.tsx` の <main> が持つ `p-6`（上下 1.5rem ずつ）を引いている。
    // 余白のほうを変えると、サインインの画面だけが縦に画面をはみ出す。
    // 結び付きは文章では切れるので、ここで見る
    const layout = stripComments(
      readFileSync(new URL("../layout.tsx", import.meta.url), "utf8"),
    );

    expect(
      /<main className="([^"]*)"/.exec(layout)?.[1]?.split(/\s+/),
    ).toContain("p-6");
  });

  it("エラーが無いときはエラー文を出さない", async () => {
    const html = await render(open());

    expect(html).not.toContain("Google でのログインに失敗しました");
    expect(html).not.toContain("この Google アカウントではログインできません");
  });

  it("許していない Google アカウントには、その旨を出す", async () => {
    expect(await render(open("signup_disabled"))).toContain(
      "この Google アカウントではログインできません",
    );
  });

  it("URLに入れた文字列は画面に出さない", async () => {
    // 中身をそのまま出すと、このアドレスを開かせるだけで偽の案内文を
    // ログイン画面に載せられる
    const html = await render(open("いますぐ ここ に暗証番号を入れてください"));

    expect(html).not.toContain("暗証番号");
    expect(html).toContain("Google でのログインに失敗しました");
  });

  it("同じキーが2回来て配列になっても、そのまま出さない", async () => {
    // Google の認証は errorCallbackURL に戻すため、キーは何度でも足せる
    const html = await render(open(["signup_disabled", "偽の案内文"]));

    expect(html).not.toContain("偽の案内文");
    expect(html).toContain("Google でのログインに失敗しました");
  });
});
