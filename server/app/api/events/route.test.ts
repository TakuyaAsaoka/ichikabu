import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../../../src/auth";
import { db } from "../../../src/db";
import {
  event,
  holding,
  stock,
  theme,
  themeStock,
  user,
} from "../../../src/db/schema";
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

/** 返る順序に依存せず比べるため、title の集合を作る */
function titles(events: Event[]): Set<string> {
  return new Set(events.map((e) => e.title));
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

  it("市場イベントは保有銘柄の市場のものと GLOBAL だけが返る", async () => {
    const jpHolder = await createUser("jp-holder@example.com");
    const usHolder = await createUser("us-holder@example.com");

    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    const [nvidia] = await db
      .insert(stock)
      .values({ market: "US", ticker: "NVDA", name: "NVIDIA" })
      .returning();
    await db
      .insert(holding)
      .values({ userId: jpHolder.id, stockId: toyota.id });
    await db
      .insert(holding)
      .values({ userId: usHolder.id, stockId: nvidia.id });

    await db.insert(event).values([
      {
        title: "日銀金融政策決定会合",
        shortLabel: "日銀",
        startDate: "2026-09-17",
        importance: 3,
        market: "JP",
      },
      {
        title: "米国市場休場",
        shortLabel: "休場",
        startDate: "2026-11-26",
        importance: 1,
        market: "US",
      },
      {
        title: "FOMC",
        shortLabel: "FOMC",
        startDate: "2026-09-16",
        importance: 3,
        market: "GLOBAL",
      },
    ]);

    const jpEvents = await fetchEvents(jpHolder.token);
    expect(titles(jpEvents)).toEqual(new Set(["日銀金融政策決定会合", "FOMC"]));
    expect(new Set(jpEvents.map((e) => e.kind))).toEqual(new Set(["market"]));

    const usEvents = await fetchEvents(usHolder.token);
    expect(titles(usEvents)).toEqual(new Set(["米国市場休場", "FOMC"]));
  });

  it("テーマイベントはテーマ所属銘柄の保有者にだけ返る", async () => {
    const holder = await createUser("theme-holder@example.com");
    const outsider = await createUser("outsider@example.com");

    const [nvidia] = await db
      .insert(stock)
      .values({ market: "US", ticker: "NVDA", name: "NVIDIA" })
      .returning();
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    const [semiconductor] = await db
      .insert(theme)
      .values({ name: "半導体" })
      .returning();
    await db
      .insert(themeStock)
      .values({ themeId: semiconductor.id, stockId: nvidia.id });
    await db.insert(holding).values({ userId: holder.id, stockId: nvidia.id });
    await db
      .insert(holding)
      .values({ userId: outsider.id, stockId: toyota.id });

    await db.insert(event).values({
      title: "SEMICON Japan",
      shortLabel: "SEMICON",
      startDate: "2026-12-16",
      endDate: "2026-12-18",
      importance: 2,
      themeId: semiconductor.id,
    });

    const held = await fetchEvents(holder.token);
    expect(titles(held)).toEqual(new Set(["SEMICON Japan"]));
    expect(held.map((e) => e.kind)).toEqual(["theme"]);
    expect(await fetchEvents(outsider.token)).toEqual([]);
  });

  it("銘柄イベントはその銘柄の保有者にだけ返る", async () => {
    const holder = await createUser("stock-holder@example.com");
    const outsider = await createUser("outsider@example.com");

    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    const [sony] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "6758", name: "ソニーグループ" })
      .returning();
    await db.insert(holding).values({ userId: holder.id, stockId: toyota.id });
    await db.insert(holding).values({ userId: outsider.id, stockId: sony.id });

    await db.insert(event).values({
      title: "トヨタ自動車 決算発表",
      shortLabel: "トヨタ決算",
      startDate: "2026-11-05",
      time: "13:25:00",
      importance: 3,
      stockId: toyota.id,
    });

    // レスポンスの組み立ても合わせて固定する。値が無いフィールドは null で返る
    expect(await fetchEvents(holder.token)).toEqual([
      {
        id: 1,
        kind: "stock",
        title: "トヨタ自動車 決算発表",
        shortLabel: "トヨタ決算",
        startDate: "2026-11-05",
        endDate: null,
        time: "13:25:00",
        importance: 3,
        note: null,
      },
    ]);
    expect(await fetchEvents(outsider.token)).toEqual([]);
  });
});
