import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test/helpers";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";
import { seedUser } from "./db/seed-user";

const EMAIL = "operator@example.com";
const PASSWORD = "correct-horse-battery-staple";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// auth.handler を通すため、この関数はレート制限の対象になる（設計書 §6）。
// /sign-in/email は組み込み規則で10秒に3回まで。1つのテストで4回以上叩くと、
// 401 でも 500 でもない 429 が返って原因の分かりにくい失敗になる。
// テストをまたぐ分は beforeEach の resetDatabase が rate_limit ごと消している
function post(path: string, body: unknown) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(resetDatabase);

describe("seed によるユーザー投入", () => {
  it("実行するとユーザーが1件だけ作られる", async () => {
    expect(await seedUser(EMAIL, PASSWORD)).toEqual({
      created: true,
      userId: expect.any(String),
    });
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("2回実行してもユーザーは増えない", async () => {
    const first = await seedUser(EMAIL, PASSWORD);
    expect(await seedUser(EMAIL, PASSWORD)).toEqual({
      created: false,
      userId: first.userId,
    });
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("大文字を含むメールアドレスでもサインインでき、2回実行しても増えない", async () => {
    const 大文字混じり = "Operator@Example.com";

    expect(await seedUser(大文字混じり, PASSWORD)).toMatchObject({
      created: true,
    });
    expect(await seedUser(大文字混じり, PASSWORD)).toMatchObject({
      created: false,
    });
    expect(await db.select().from(user)).toHaveLength(1);

    const res = await post("sign-in/email", {
      email: 大文字混じり,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
  });

  it("ユーザーだけ作られた状態で中断していても、実行し直せばサインインできるようになる", async () => {
    // 1回目がユーザー作成のあとで落ちた状態を作る
    await db
      .insert(user)
      .values({ id: "中断で残ったユーザー", name: EMAIL, email: EMAIL });

    expect(await seedUser(EMAIL, PASSWORD)).toEqual({
      created: true,
      userId: "中断で残ったユーザー",
    });
    expect(await db.select().from(user)).toHaveLength(1);

    const res = await post("sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
  });
});

describe("サインイン", () => {
  beforeEach(async () => {
    await seedUser(EMAIL, PASSWORD);
  });

  it("seed したユーザーの資格情報で 200 が返る", async () => {
    const res = await post("sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
  });

  it("iOS向けのトークンが返り、そのトークンでセッションを取得できる", async () => {
    const signIn = await post("sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    // Bearer プラグインがサインイン応答に載せるトークン（設計書 §9）
    const token = signIn.headers.get("set-auth-token");
    expect(token).toBeTruthy();

    const session = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      user: { email: EMAIL },
    });
  });

  it("誤ったパスワードでは 401 が返る", async () => {
    const res = await post("sign-in/email", {
      email: EMAIL,
      password: "wrong-password",
    });
    expect(res.status).toBe(401);
  });
});

describe("サインアップ", () => {
  it("無効になっており、新しいユーザーは作られない", async () => {
    const res = await post("sign-up/email", {
      email: "intruder@example.com",
      password: PASSWORD,
      name: "侵入者",
    });

    expect(res.status).toBe(400);
    expect(await db.select().from(user)).toEqual([]);
  });
});

describe("Google でのサインイン", () => {
  it("Google の同意画面のURLが返る", async () => {
    const res = await post("sign-in/social", {
      provider: "google",
      callbackURL: "/",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; redirect: boolean };
    expect(body.redirect).toBe(true);
    // client_id が入るのは、設定した値が実際に組み立てに使われているとき
    const url = new URL(body.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(
      process.env.GOOGLE_CLIENT_ID,
    );
  });

  // Google から戻ってきた先で Better Auth が利用者を作ろうとする一点。
  // /callback/google も /sign-in/social に ID トークンを渡す経路も、
  // 新しい利用者を作るときは必ずここを通る（better-auth の link-account.mjs）。
  // 本物の Google のトークンを用意しないと経路の端から端までは通せないので、
  // 全経路が集まるこの関数を直接叩いて、関門が効いていることを確かめる
  it("許可していない Google アカウントでは利用者が作られない", async () => {
    const ctx = await auth.$context;

    await expect(
      ctx.internalAdapter.createOAuthUser(
        {
          email: "intruder@example.com",
          name: "侵入者",
          emailVerified: true,
        },
        { providerId: "google", accountId: "google-の侵入者" },
      ),
    ).rejects.toThrow();

    expect(await db.select().from(user)).toEqual([]);
  });
});
