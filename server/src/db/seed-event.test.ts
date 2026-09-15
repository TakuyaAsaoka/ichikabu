import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../../test/helpers";
import { db } from ".";
import { stock, theme, themeStock } from "./schema";
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
  it("開発用DBには、テーマ「自動車」と 7203 の所属が1件ずつ入り、2回流しても増えない", async () => {
    await seedEvents();

    expect(await seedSampleTheme()).toEqual({ skipped: false });
    expect(await seedSampleTheme()).toEqual({ skipped: false });

    expect(await themeRows()).toEqual({
      themes: [{ name: "自動車" }],
      belongings: [{ name: "自動車", ticker: "7203" }],
    });
  });

  it("接続先が 127.0.0.1 でも開発用DBとして入れる", async () => {
    await seedEvents();
    const url = new URL(testDatabaseUrl);
    url.hostname = "127.0.0.1";
    vi.stubEnv("DATABASE_URL", url.href);

    expect(await seedSampleTheme()).toEqual({ skipped: false });
    expect((await themeRows()).belongings).toEqual([
      { name: "自動車", ticker: "7203" },
    ]);
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
