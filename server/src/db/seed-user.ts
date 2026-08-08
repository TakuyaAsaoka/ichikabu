import { auth } from "../auth";

/** メール＋パスワードのアカウントを表す Better Auth の予約値 */
const CREDENTIAL = "credential";

/**
 * 利用者を1件だけ投入する（設計書 §9）。
 * サインアップは無効なので、Better Auth のサーバー側APIを直接呼んで作る。
 *
 * サインインにはユーザーとパスワードのアカウントの両方が要る。
 * 判定をユーザーの有無ではなくアカウントの有無で行うことで、
 * ユーザーだけ作られた状態で中断しても、次の実行が足りない分を補える。
 */
export async function seedUser(
  email: string,
  password: string,
): Promise<{ created: boolean; userId: string }> {
  const ctx = await auth.$context;

  const found = await ctx.internalAdapter.findUserByEmail(email, {
    includeAccounts: true,
  });
  if (found?.accounts.some((a) => a.providerId === CREDENTIAL)) {
    return { created: false, userId: found.user.id };
  }

  const user =
    found?.user ??
    (await ctx.internalAdapter.createUser({
      email,
      name: email,
      // 運用者本人を手で入れるため、メール確認の経路は用意しない
      emailVerified: true,
    }));

  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: CREDENTIAL,
    accountId: user.id,
    password: await ctx.password.hash(password),
  });

  return { created: true, userId: user.id };
}
