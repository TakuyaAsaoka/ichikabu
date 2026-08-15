import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** サインインの画面が受け付けるパスワード。テストの利用者はこれで作る */
export const PASSWORD = "correct-horse-battery-staple";

/** 画面が返す React の要素。Server Component は非同期の関数 */
type Page = () => Promise<ReactNode>;

/** `auth.handler` の型。テストが `src/auth` を読み込む順を縛らないために受け取る */
type Handler = (request: Request) => Promise<Response>;

/**
 * サインインして、以降の描画に載せる Cookie の入った Headers を返す。
 *
 * セッションは差し替えず、本物の Better Auth のトークンを使う。
 * 差し替えると、画面が本当にサインインを見ているかを確かめられなくなる
 */
export async function signInAs(
  handler: Handler,
  email: string,
): Promise<Headers> {
  const res = await handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const cookie = res.headers.get("set-cookie");
  if (!cookie) {
    throw new Error(`サインインできなかった: ${email}`);
  }
  return new Headers({ cookie: cookie.split(";")[0] });
}

/**
 * 画面を描いてHTMLで返す。
 *
 * Server Component は React の要素を返す非同期の関数なので、そのまま呼べる。
 * ブラウザもDOMも要らない（`react-dom` は package.json の依存に入っている）。
 *
 * この形が効くのは、返る要素の中に非同期のコンポーネントが入れ子で無いときだけ。
 * 入れ子があると `renderToStaticMarkup` は待てずに落ちる。
 *
 * **`app/layout.tsx` はここでは描かれない。** 画面の行き先（`app/nav.tsx`）を
 * レイアウトに置かないのはこのため（Issue #112 で討論して決めた）
 */
export async function render(page: Page): Promise<string> {
  return renderToStaticMarkup(await page());
}

/**
 * 中断の合図を取り出す。Next.js は `redirect()` も `notFound()` も例外で表し、
 * 中身は `message` ではなく `digest` にしか入っていない。
 * `prefix` で始まらないもの（本物のエラー）は、握りつぶさずにそのまま投げ直す
 */
async function digestOf(
  run: () => Promise<unknown>,
  prefix: string,
  whenNotThrown: string,
): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (typeof digest === "string" && digest.startsWith(prefix)) {
      return digest;
    }
    throw error;
  }
  throw new Error(whenNotThrown);
}

/**
 * `notFound()` に落ちたことを確かめ、digest をそのまま返す。
 * 落ちなかったら落とす。
 *
 * digest は `NEXT_HTTP_ERROR_FALLBACK;404` の形（実測）。**番号まで比べること。**
 * `NEXT_HTTP_ERROR_FALLBACK` だけを見ると `forbidden()`（403）と見分けが付かない
 * （`redirectedTo` と同じ理由）
 */
export function notFoundOn(run: () => Promise<unknown>): Promise<string> {
  return digestOf(
    run,
    "NEXT_HTTP_ERROR_FALLBACK;",
    "見つからない扱いになるはずの画面が、最後まで描き切った",
  );
}

/**
 * `redirect()` の行き先。追い返されなかったら落とす。
 * 画面（`Page`）と Server Action のどちらにも使える。
 *
 * 行き先は例外の `digest` にしか入っていない。`message` は `NEXT_REDIRECT` だけで、
 * `toThrow(/NEXT_REDIRECT/)` の形だと**行き先を1文字も見ていない**ことになる
 * （Issue #112 で実測）
 */
export async function redirectedTo(
  run: () => Promise<unknown>,
): Promise<string> {
  // digest は `NEXT_REDIRECT;replace;/signin;307;` の形（実測）
  const digest = await digestOf(
    run,
    "NEXT_REDIRECT;",
    "行き先へ送られるはずの処理が、送られずに終わった",
  );
  return digest.split(";")[2];
}
