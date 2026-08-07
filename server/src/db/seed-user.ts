import { auth } from "../auth";

/**
 * 利用者を1件だけ投入する（設計書 §9）。
 * サインアップは無効なので、Better Auth のサーバー側APIを直接呼んで作る。
 * 既にいる場合は何もしない（何度実行しても結果が変わらない）。
 */
export async function seedUser(
  email: string,
  password: string,
): Promise<{ created: boolean }> {
  const ctx = await auth.$context;

  if (await ctx.internalAdapter.findUserByEmail(email)) {
    return { created: false };
  }

  const user = await ctx.internalAdapter.createUser({
    email,
    name: email,
    // 運用者本人を手で入れるため、メール確認の経路は用意しない
    emailVerified: true,
  });

  await ctx.internalAdapter.createAccount({
    userId: user.id,
    // メール＋パスワードのアカウントを表す Better Auth の予約値
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });

  return { created: true };
}
