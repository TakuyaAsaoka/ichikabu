import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test/helpers";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";
import { seedUser } from "./db/seed-user";

const EMAIL = "operator@example.com";
const PASSWORD = "correct-horse-battery-staple";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
    expect(await seedUser(EMAIL, PASSWORD)).toEqual({ created: true });
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("2回実行してもユーザーは増えない", async () => {
    await seedUser(EMAIL, PASSWORD);
    expect(await seedUser(EMAIL, PASSWORD)).toEqual({ created: false });
    expect(await db.select().from(user)).toHaveLength(1);
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

  it("誤ったパスワードでは 200 が返らない", async () => {
    const res = await post("sign-in/email", {
      email: EMAIL,
      password: "wrong-password",
    });
    expect(res.status).not.toBe(200);
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
