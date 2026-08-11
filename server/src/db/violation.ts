/**
 * pg のエラーが持つ情報を取り出す。Drizzle は元のエラーを cause に包む。
 * code はエラーの種類（22003 = 範囲外、22P02 = 形式違い、23514 = CHECK違反 など）で
 * pg のエラーには必ず入る。constraint は制約違反のときだけ入る
 */
export function pgError(error: unknown): {
  code?: string;
  constraint?: string;
} {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && typeof current.code === "string") {
      return {
        code: current.code,
        constraint:
          "constraint" in current && typeof current.constraint === "string"
            ? current.constraint
            : undefined,
      };
    }
    current = current.cause;
  }
  return {};
}
