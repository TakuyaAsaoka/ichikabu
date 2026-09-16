import { readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
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
import Page from "./page";

const EDITOR = "editor@example.com";

/** クエリ文字列の `error` を渡して画面を描く */
function open(error?: string | string[]) {
  return () => Page({ searchParams: Promise.resolve({ error }) });
}

/**
 * `app/` の画面ごとに、`<h1>` に書いてある class を集める（[画面の位置, class]）。
 *
 * 描いたHTMLではなくソースを読む。class は Tailwind の指定そのままで出るが、
 * 「他の画面と同じ値か」を見るには、9画面ぶんを描いて集めるより読むほうが速い
 */
function headingClasses(): [string, string][] {
  const appDir = new URL("../", import.meta.url);

  return readdirSync(appDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith("page.tsx"))
    .map((file) => [
      dirname(file),
      /<h1 className="([^"]*)"/.exec(
        readFileSync(new URL(file, appDir), "utf8"),
      )?.[1] ?? "",
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
    expect(classes.filter(([, className]) => className === "")).toEqual([]);

    const signin = classes.find(([dir]) => dir === "signin")?.[1];

    // 「9画面が `text-xl font-bold` であること」は求めない。求めるのは
    // 「signin の class が他のどれとも一致しないこと」だけ。
    // 他の画面の見出しを将来変えても、この検査は巻き込まれない
    expect(
      classes
        .filter(([dir, className]) => dir !== "signin" && className === signin)
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
    expect(root.some((className) => className.startsWith("max-w-"))).toBe(true);
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
