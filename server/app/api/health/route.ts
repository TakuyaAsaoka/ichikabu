import type { components } from "../../../src/generated/api";

// レスポンスの型は openapi.yaml から生成したものを参照する。
// 契約を変えて実装が追随していなければ typecheck が落ちる（設計書 §8）。
type Health = components["schemas"]["Health"];

export function GET() {
  const body: Health = { status: "ok" };
  return Response.json(body);
}
