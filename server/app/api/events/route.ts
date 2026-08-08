import { auth } from "../../../src/auth";
import type { components } from "../../../src/generated/api";

// レスポンスの型は openapi.yaml から生成したものを参照する。
// 契約を変えて実装が追随していなければ typecheck が落ちる（全体設計書 §8）。
type Event = components["schemas"]["Event"];

export async function GET(request: Request): Promise<Response> {
  // bearer プラグインの before フックが authorization ヘッダーを
  // セッションクッキーに変換するため、auth.handler を経由しなくても
  // getSession だけで Bearer 認証を判定できる
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    // 401 の本文は使われないので返さない（イベント取得API設計書 §2）
    return new Response(null, { status: 401 });
  }

  // 表示対象の判定はタスク3で実装する。ここでは認証だけを固定する
  const body: Event[] = [];
  return Response.json(body);
}
