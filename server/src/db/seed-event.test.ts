import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../../test/helpers";
import { db } from ".";
import { event, stock, theme, themeStock } from "./schema";
import { seedEvents, seedSampleTheme } from "./seed-event";

// テストの接続先（vitest.config.ts が TEST_DATABASE_URL を入れる。localhost の開発用DB）
const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL が設定されていない");
}

beforeEach(resetDatabase);
afterEach(() => {
  vi.stubEnv("DATABASE_URL", testDatabaseUrl);
});

/** テーマ名と、そこに入っている銘柄のティッカーの組を全部読む */
async function themeRows() {
  const themes = await db.select({ name: theme.name }).from(theme);
  const belongings = await db
    .select({ name: theme.name, ticker: stock.ticker })
    .from(themeStock)
    .innerJoin(theme, eq(themeStock.themeId, theme.id))
    .innerJoin(stock, eq(themeStock.stockId, stock.id));
  return { themes, belongings };
}

describe("seedSampleTheme", () => {
  it("開発用DBには、テーマ「自動車」と「（見本）大型株」が入り、所属は3件で、2回流しても増えない", async () => {
    await seedEvents();

    expect(await seedSampleTheme()).toEqual({ skipped: false });
    expect(await seedSampleTheme()).toEqual({ skipped: false });

    // 並びは問わない。大型株には 7203 と 9434 が入る
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name);
    const rows = await themeRows();
    expect(rows.themes.sort(byName)).toEqual(
      [{ name: "自動車" }, { name: "（見本）大型株" }].sort(byName),
    );
    expect(rows.belongings.map((r) => `${r.name}:${r.ticker}`).sort()).toEqual(
      ["自動車:7203", "（見本）大型株:7203", "（見本）大型株:9434"].sort(),
    );
  });

  it("開発用DBには、テーマ「自動車」を対象にした見本のイベントが2件入り、2回流しても増えない", async () => {
    await seedEvents();

    await seedSampleTheme();
    await seedSampleTheme();

    const rows = await db
      .select({
        title: event.title,
        shortLabel: event.shortLabel,
        startDate: event.startDate,
        importance: event.importance,
        themeName: theme.name,
        time: event.time,
        note: event.note,
        sourceUrl: event.sourceUrl,
        sourceName: event.sourceName,
      })
      .from(event)
      .innerJoin(theme, eq(event.themeId, theme.id))
      .orderBy(event.startDate);
    expect(rows).toEqual([
      {
        title: "（見本）自動車のテーマのイベント",
        shortLabel: "自動車",
        startDate: "2026-11-06",
        importance: 2,
        themeName: "自動車",
        time: null,
        note: null,
        sourceUrl: null,
        sourceName: null,
      },
      {
        title: "（見本）自動車のテーマのイベント その2",
        shortLabel: "自動車",
        startDate: "2026-11-27",
        importance: 3,
        themeName: "自動車",
        time: null,
        note: null,
        sourceUrl: null,
        sourceName: null,
      },
    ]);
  });

  it("接続先が 127.0.0.1 でも開発用DBとして入れる", async () => {
    await seedEvents();
    const url = new URL(testDatabaseUrl);
    url.hostname = "127.0.0.1";
    vi.stubEnv("DATABASE_URL", url.href);

    expect(await seedSampleTheme()).toEqual({ skipped: false });
    expect((await themeRows()).belongings).toHaveLength(3);
  });

  it("所属先の 7203 が無ければ、黙って成功せずに落ちる", async () => {
    await expect(seedSampleTheme()).rejects.toThrow("銘柄が見つからない: 7203");
  });

  // 本番の接続先の形は docs/guides/deploy.md §4 と docs/guides/backup.md の例から取る
  it.each([
    [
      "Supabase の pooler",
      "postgres://postgres.abcdefghijklmnop:pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
      "aws-0-ap-northeast-1.pooler.supabase.com",
    ],
    [
      "Supabase への直接接続",
      "postgres://postgres:pass@db.abcdefghijklmnop.supabase.co:5432/postgres",
      "db.abcdefghijklmnop.supabase.co",
    ],
    [
      "localhost で始まる別のホスト",
      "postgres://postgres:pass@localhost.example.com:5432/postgres",
      "localhost.example.com",
    ],
    ["URL として読めない値", "not a url", ""],
  ])("接続先が%sなら何も入れない", async (_label, url, host) => {
    await seedEvents();
    vi.stubEnv("DATABASE_URL", url);

    expect(await seedSampleTheme()).toEqual({ skipped: true, host });
    expect(await themeRows()).toEqual({ themes: [], belongings: [] });
  });
});
