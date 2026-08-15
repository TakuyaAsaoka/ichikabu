import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/db";
import { event, stock, theme, themeStock } from "../../../src/db/schema";
import type { components } from "../../../src/generated/api";
import {
  expectPublicApiCacheHeaders,
  resetDatabase,
} from "../../../test/helpers";
import { GET } from "./route";

type Event = components["schemas"]["Event"];

/**
 * ハンドラを呼び、200 を確かめて本文の配列を返す。
 * `GET` は引数を取らない。誰が呼んでも同じ配列が返る（ログイン廃止 設計書 §5）
 */
async function fetchEvents(): Promise<Event[]> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

/** 返る順序に依存せず比べるため、title の集合を作る */
function titles(events: Event[]): Set<string> {
  return new Set(events.map((e) => e.title));
}

beforeEach(resetDatabase);

describe("GET /api/events", () => {
  it("認証ヘッダーが無くても 200 を返す", async () => {
    // `GET` が要求そのものを受け取らないため、認証ヘッダーを見る余地が無い。
    // ヘッダー付きの場合を別に確かめないのは、渡す口が型として無いため
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("CDN に載せるヘッダを返す", async () => {
    expectPublicApiCacheHeaders(await GET());
  });

  it("市場イベントは GLOBAL も JP も US も全件返る", async () => {
    // 絞り込みはサーバーに無い。市場で出し分けるのは端末の責任
    // （ios/Ichikabu/EventLayout.swift の visible）
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

    expect(titles(await fetchEvents())).toEqual(
      new Set(["日銀金融政策決定会合", "米国市場休場", "FOMC"]),
    );
  });

  it("テーマイベントと銘柄イベントも全件返る", async () => {
    const [nvidia] = await db
      .insert(stock)
      .values({ market: "US", ticker: "NVDA", name: "NVIDIA" })
      .returning();
    const [semiconductor] = await db
      .insert(theme)
      .values({ name: "半導体" })
      .returning();
    await db
      .insert(themeStock)
      .values({ themeId: semiconductor.id, stockId: nvidia.id });

    await db.insert(event).values([
      {
        title: "SEMICON Japan",
        shortLabel: "SEMICON",
        startDate: "2026-12-16",
        endDate: "2026-12-18",
        importance: 2,
        themeId: semiconductor.id,
      },
      {
        title: "NVIDIA 決算発表",
        shortLabel: "NVDA決算",
        startDate: "2026-11-19",
        importance: 3,
        stockId: nvidia.id,
      },
    ]);

    expect(titles(await fetchEvents())).toEqual(
      new Set(["SEMICON Japan", "NVIDIA 決算発表"]),
    );
  });

  it("銘柄イベントは値が無いフィールドを null にして返る", async () => {
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();

    await db.insert(event).values({
      title: "トヨタ自動車 決算発表",
      shortLabel: "トヨタ決算",
      startDate: "2026-11-05",
      time: "13:25:00",
      importance: 3,
      stockId: toyota.id,
    });

    // レスポンスの組み立ても合わせて固定する
    expect(await fetchEvents()).toEqual([
      {
        id: "1",
        kind: "stock",
        target: { type: "stock", stockId: toyota.id },
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
  });

  it("イベントの対象は kind と一致し、登録した銘柄・テーマ・市場を指す", async () => {
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();
    const [car] = await db.insert(theme).values({ name: "自動車" }).returning();
    await db.insert(themeStock).values({ themeId: car.id, stockId: toyota.id });

    await db.insert(event).values([
      {
        title: "トヨタ自動車 決算発表",
        shortLabel: "トヨタ決算",
        startDate: "2026-11-05",
        importance: 1,
        stockId: toyota.id,
      },
      {
        title: "ジャパンモビリティショー",
        shortLabel: "JMS",
        startDate: "2026-11-06",
        importance: 1,
        themeId: car.id,
      },
      {
        title: "日銀金融政策決定会合",
        shortLabel: "日銀",
        startDate: "2026-11-07",
        importance: 1,
        market: "JP",
      },
    ]);

    // 契約は kind と target.type が食い違う組み合わせも表せてしまうため、
    // 両方が同じ対象を指すことをここで固定する（ログイン廃止 設計書 §3.1）
    const events = await fetchEvents();
    expect(events.map((e) => [e.kind, e.target])).toEqual([
      ["stock", { type: "stock", stockId: toyota.id }],
      ["theme", { type: "theme", themeId: car.id }],
      ["market", { type: "market", market: "JP" }],
    ]);
  });

  it("出典の名前とURLが揃っているイベントは source が返る", async () => {
    await db.insert(event).values({
      title: "消費者物価指数（2026年8月分）",
      shortLabel: "CPI",
      startDate: "2026-09-18",
      importance: 2,
      market: "JP",
      sourceName: "総務省（PDL1.0）",
      sourceUrl: "https://www.stat.go.jp/data/cpi/",
    });

    const [event0] = await fetchEvents();
    expect(event0.source).toEqual({
      name: "総務省（PDL1.0）",
      url: "https://www.stat.go.jp/data/cpi/",
    });
  });

  it("出典のURLだけのイベントは source が null になる", async () => {
    // source_url は運用者が誤登録を追うための記録で、画面には出さない（設計書 §3.1）
    const [toyota] = await db
      .insert(stock)
      .values({ market: "JP", ticker: "7203", name: "トヨタ自動車" })
      .returning();

    await db.insert(event).values({
      title: "トヨタ自動車 決算発表",
      shortLabel: "トヨタ決算",
      startDate: "2026-11-05",
      importance: 3,
      stockId: toyota.id,
      sourceUrl: "https://global.toyota/jp/ir/",
    });

    const [event0] = await fetchEvents();
    expect(event0.source).toBeNull();
  });

  it("非アクティブのイベントは返らない", async () => {
    // 取り込みが「これからの回なのに公表予定に載らなくなった」と判定した行
    // （公表予定の非アクティブ化 設計書 §1）。開始日は見ない。中止された回は
    // 公表日を過ぎても出してはならない
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

    expect(titles(await fetchEvents())).toEqual(
      new Set(["消費者物価指数（2026年9月分）"]),
    );
  });

  it("決算月が入っている銘柄すべてについて権利付最終日が返る", async () => {
    // 保有していることは条件にならない（ログイン廃止 設計書 §5.2）
    const [toyota] = await db
      .insert(stock)
      .values({
        market: "JP",
        ticker: "7203",
        name: "トヨタ自動車",
        fiscalMonth: 3,
      })
      .returning();
    const [shimamura] = await db
      .insert(stock)
      .values({
        market: "JP",
        ticker: "8227",
        name: "しまむら",
        fiscalMonth: 2,
      })
      .returning();

    // 登録したイベントは1件も無いので、返るのは計算した権利日だけになる。
    // 休場日リストが載っている年ぶん（2025〜2027）×2銘柄。
    // リストに年を足したらこの期待値も足すこと（落ちて気づく）
    const events = await fetchEvents();
    expect(events.map((e) => e.startDate)).toEqual([
      "2025-02-26",
      "2025-03-27",
      "2026-02-25",
      "2026-03-27",
      "2027-02-24",
      "2027-03-29",
    ]);
    expect(new Set(events.map((e) => e.shortLabel))).toEqual(
      new Set(["7203権利", "8227権利"]),
    );
    // 組み立ても固定する。配当落ち日はカレンダーに出さず note に入る（権利日設計書 §6）
    expect(events[3]).toEqual({
      id: `rights-${toyota.id}-2026`,
      kind: "stock",
      // 計算した権利日も、登録した銘柄イベントと同じ形で対象を持つ。
      // 端末は両方を同じ式で絞れる（ログイン廃止 設計書 §3.1）
      target: { type: "stock", stockId: toyota.id },
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
    expect(events[2].target).toEqual({ type: "stock", stockId: shimamura.id });
  });

  it("決算月のないJP銘柄には権利付最終日が出ない", async () => {
    await db
      .insert(stock)
      .values({ market: "JP", ticker: "6758", name: "ソニーグループ" });

    expect(await fetchEvents()).toEqual([]);
  });

  it("イベントは startDate・time・id の昇順で返る", async () => {
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

    const events = await fetchEvents();
    expect(events.map((e) => e.title)).toEqual(["C", "B", "A", "D"]);
  });

  it("同じ日時のイベントは id の文字列としての順で返る", async () => {
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

    const events = await fetchEvents();
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
