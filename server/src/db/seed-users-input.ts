/** `pnpm db:seed` で作る利用者1人ぶん */
export type SeedUser = { email: string; password: string };

/**
 * 要素から文字列の欄を読む。JSON の中身は何が来るか分からないので、
 * 型で絞り込んでから読む
 */
function textOf(raw: unknown, key: "email" | "password"): string {
  if (typeof raw !== "object" || raw === null || !(key in raw)) {
    return "";
  }
  const value = raw[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 環境変数 `SEED_USERS` の値を利用者の一覧にする。
 * 読めなければ日本語のエラー文を返す（app/bulk-event-input.ts と同じ形）。
 *
 * JSON にしたのは、パスワードにどんな文字が入っても壊れないようにするため。
 * カンマ区切りやコロン区切りだと、区切り文字を含むパスワードで割れる
 * （設計書 §3）
 */
export function toSeedUsers(text: string): SeedUser[] | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "SEED_USERS が JSON として読めない";
  }

  if (!Array.isArray(parsed)) {
    return "SEED_USERS は配列にする";
  }
  if (parsed.length === 0) {
    return "SEED_USERS に利用者が1人も入っていない";
  }

  const users: SeedUser[] = [];
  for (const [index, raw] of parsed.entries()) {
    const email = textOf(raw, "email");
    if (email === "") {
      return `${index + 1}人目: メールアドレスを入れる`;
    }
    const password = textOf(raw, "password");
    if (password === "") {
      return `${index + 1}人目: パスワードを入れる`;
    }
    users.push({ email, password });
  }
  return users;
}
