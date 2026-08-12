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

  it("でたらめな Bearer トークンでは 401 を返す", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/events", {
        headers: { authorization: "Bearer deadbeef" },
      }),
    );
    expect(res.status).toBe(401);
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
        id: "1",
        kind: "stock",
        title: "トヨタ自動車 決算発表",
        shortLabel: "トヨタ決算",
        startDate: "2026-11-05",
        endDate: null,
        time: "13:25:00",
        importance: 3,
        note: null,
        source: null,
      },
    ]);
    expect(await fetchEvents(outsider.token)).toEqual([]);
  });

  it("出典の名前とURLが揃っているイベントは source が返る", async () => {
    const holder = await createUser("source-holder@example.com");
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    await db.insert(holding).values({ userId: holder.id, stockId: toyota.id });

    await db.insert(event).values({
      title: "消費者物価指数（2026年8月分）",
      shortLabel: "CPI",
      startDate: "2026-09-18",
      importance: 2,
      market: "JP",
      sourceName: "総務省（PDL1.0）",
      sourceUrl: "https://www.stat.go.jp/data/cpi/",
    });

    const [event0] = await fetchEvents(holder.token);
    expect(event0.source).toEqual({
      name: "総務省（PDL1.0）",
      url: "https://www.stat.go.jp/data/cpi/",
    });
  });

  it("出典のURLだけのイベントは source が null になる", async () => {
    // source_url は運用者が誤登録を追うための記録で、画面には出さない（設計書 §3.1）
    const holder = await createUser("url-only-holder@example.com");
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    await db.insert(holding).values({ userId: holder.id, stockId: toyota.id });

    await db.insert(event).values({
      title: "トヨタ自動車 決算発表",
      shortLabel: "トヨタ決算",
      startDate: "2026-11-05",
      importance: 3,
      stockId: toyota.id,
      sourceUrl: "https://global.toyota/jp/ir/",
    });

    const [event0] = await fetchEvents(holder.token);
    expect(event0.source).toBeNull();
  });

  it("非アクティブのイベントは返らない", async () => {
    // 取り込みが「これからの回なのに公表予定に載らなくなった」と判定した行
    // （公表予定の非アクティブ化 設計書 §1）。開始日は見ない。中止された回は
    // 公表日を過ぎても出してはならない
    const holder = await createUser("inactive-holder@example.com");
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    await db.insert(holding).values({ userId: holder.id, stockId: toyota.id });

    await db.insert(event).values([
      {
        title: "消費者物価指数（2026年9月分）",
        shortLabel: "日本CPI",
        startDate: "2026-10-23",
        importance: 2,
        market: "JP",
      },
      {
        title: "消費者物価指数（2026年10月分）",
        shortLabel: "日本CPI",
        startDate: "2026-11-20",
        importance: 2,
        market: "JP",
        active: false,
      },
      {
        title: "中止された過去の回",
        shortLabel: "中止",
        startDate: "2020-01-01",
        importance: 2,
        market: "JP",
        active: false,
      },
    ]);

    expect(titles(await fetchEvents(holder.token))).toEqual(
      new Set(["消費者物価指数（2026年9月分）"]),
    );
  });

  it("決算月のあるJP銘柄を保有していると権利付最終日が計算されて返る", async () => {
    const holder = await createUser("rights-holder@example.com");
    const [toyota] = await db
      .insert(stock)
      .values({
        market: "JP",
        ticker: "7203",
        name: "トヨタ自動車",
        fiscalMonth: 3,
      })
      .returning();
    await db.insert(holding).values({ userId: holder.id, stockId: toyota.id });

    // 登録したイベントは1件も無いので、返るのは計算した権利日だけになる。
    // 休場日リストが載っている年ぶん（2025〜2027）返る。
    // リストに年を足したらこの期待値も足すこと（落ちて気づく）
    const events = await fetchEvents(holder.token);
    expect(events.map((e) => e.startDate)).toEqual([
      "2025-03-27",
      "2026-03-27",
      "2027-03-29",
    ]);
    // 組み立ても固定する。配当落ち日はカレンダーに出さず note に入る（権利日設計書 §6）
    expect(events[1]).toEqual({
      id: `rights-${toyota.id}-2026`,
      kind: "stock",
      title: "トヨタ自動車 権利付最終日",
      shortLabel: "7203権利",
      startDate: "2026-03-27",
      endDate: null,
      time: null,
      importance: 2,
      note: "権利確定日 3月31日 ・ 配当落ち日 3月30日",
      // 休場日リストから計算した日付で、転記元が無い（出典表示設計書 §4）
      source: null,
    });
  });

  it("決算月のないJP銘柄には権利付最終日が出ない", async () => {
    const holder = await createUser("no-fiscal-holder@example.com");
    const [sony] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "6758", name: "ソニーグループ" })
      .returning();
    await db.insert(holding).values({ userId: holder.id, stockId: sony.id });

    expect(await fetchEvents(holder.token)).toEqual([]);
  });

  it("イベントは startDate・time・id の昇順で返る", async () => {
    const holder = await createUser("order-holder@example.com");

    // 同じ日（2026-09-16）に時刻ありと時刻なしを混在させ、日をまたがせる。
    // 時刻なしは PostgreSQL の既定（昇順で NULL は最後）どおり同じ日の
    // 時刻ありより後ろに来る想定
    await db.insert(event).values([
      {
        title: "B",
        shortLabel: "B",
        startDate: "2026-09-16",
        time: "09:00:00",
        importance: 1,
        market: "GLOBAL",
      },
      {
        title: "A",
        shortLabel: "A",
        startDate: "2026-09-16",
        importance: 1,
        market: "GLOBAL",
      },
      {
        title: "C",
        shortLabel: "C",
        startDate: "2026-09-15",
        importance: 1,
        market: "GLOBAL",
      },
      {
        title: "D",
        shortLabel: "D",
        startDate: "2026-09-17",
        time: "08:00:00",
        importance: 1,
        market: "GLOBAL",
      },
    ]);

    const events = await fetchEvents(holder.token);
    expect(events.map((e) => e.title)).toEqual(["C", "B", "A", "D"]);
  });

  it("同じ日時のイベントは id の文字列としての順で返る", async () => {
    const holder = await createUser("tiebreak-holder@example.com");

    // 契約の id が整数から文字列になったことで、10件目からは "10" が "9" より前に来る。
    // 同じ日に3件以上あるとセルに出るのは先頭2件だけなので、この順序は表示に効く
    await db.insert(event).values(
      Array.from({ length: 10 }, (_, index) => ({
        title: `${index + 1}`,
        shortLabel: `${index + 1}`,
        startDate: "2026-09-16",
        importance: 1,
        market: "GLOBAL" as const,
      })),
    );

    const events = await fetchEvents(holder.token);
    expect(events.map((e) => e.id)).toEqual([
      "1",
      "10",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
  });
});
