import { PUBLIC_API_CACHE_HEADERS } from "../../../src/cache";
import { db } from "../../../src/db";
import { theme } from "../../../src/db/schema";
import type { components } from "../../../src/generated/api";

// レスポンスの型は openapi.yaml から生成したものを参照する。
// 契約を変えて実装が追随していなければ typecheck が落ちる。
type Theme = components["schemas"]["Theme"];

/**
 * テーマ一覧。認証は要らない。
 * 返すのは運用者が登録したテーマだけで、誰が何を持っているかは含まない。
 */
export async function GET(): Promise<Response> {
  const themes: Theme[] = await db
    .select({ id: theme.id, name: theme.name })
    .from(theme)
    .orderBy(theme.id);
  return Response.json(themes, { headers: PUBLIC_API_CACHE_HEADERS });
}
