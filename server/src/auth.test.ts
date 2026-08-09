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
