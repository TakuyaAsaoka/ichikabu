import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/db";
import { theme } from "../../../src/db/schema";
import type { components } from "../../../src/generated/api";
import {
  expectPublicApiCacheHeaders,
  resetDatabase,
} from "../../../test/helpers";
import { GET } from "./route";

type Theme = components["schemas"]["Theme"];

/** ハンドラを呼び、200 を確かめて本文の配列を返す */
async function fetchThemes(): Promise<Theme[]> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(resetDatabase);

describe("GET /api/themes", () => {
  it("テーマが無ければ 200 で空配列を返す", async () => {
    expect(await fetchThemes()).toEqual([]);
  });

  it("CDN に載せるヘッダを返す", async () => {
    expectPublicApiCacheHeaders(await GET());
  });

  it("認証なしでテーマ一覧が返り、欄は id と name だけになる", async () => {
    // 認証は要らない。トークンを渡さずに呼べる。
    // 並び順（id の昇順）はここでは確かめない。入れた順と id の順が同じで、
    // orderBy を消しても緑のままになる（消して確かめた）ため、守れないものは書かない
    const [semiconductor] = await db
      .insert(theme)
      .values({ name: "半導体" })
      .returning();
    const [ai] = await db.insert(theme).values({ name: "AI" }).returning();

    expect(await fetchThemes()).toEqual([
      { id: semiconductor.id, name: "半導体" },
      { id: ai.id, name: "AI" },
    ]);
  });
});
