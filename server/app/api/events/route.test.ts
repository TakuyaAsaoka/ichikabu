import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import { user } from "../../../src/db/schema";
import { seedUser } from "../../../src/db/seed-user";
import type { components } from "../../../src/generated/api";
import { resetDatabase } from "../../../test/helpers";
import { GET } from "./route";

type Event = components["schemas"]["Event"];

const PASSWORD = "correct-horse-battery-staple";

/** 利用者を作り、user.id と Bearer トークンを返す */
async function createUser(
  email: string,
): Promise<{ id: string; token: string }> {
  await seedUser(email, PASSWORD);
  const signIn = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  // bearer プラグインがサインイン応答に載せるトークン（全体設計書 §9）
  const token = signIn.headers.get("set-auth-token");
  if (!token) {
    throw new Error("サインイン応答に set-auth-token が無い");
  }
  const [found] = await db.select().from(user).where(eq(user.email, email));
  return { id: found.id, token };
}

/** Bearer トークン付きでハンドラを呼び、200 を確かめて本文の配列を返す */
async function fetchEvents(token: string): Promise<Event[]> {
  const res = await GET(
    new Request("http://localhost:3000/api/events", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(resetDatabase);

describe("GET /api/events", () => {
  it("Bearer トークンなしでは 401 を本文なしで返す", async () => {
    const res = await GET(new Request("http://localhost:3000/api/events"));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
  });

  it("Bearer トークンありでイベントが無ければ 200 で空配列を返す", async () => {
    const holder = await createUser("holder@example.com");
    expect(await fetchEvents(holder.token)).toEqual([]);
  });
});
