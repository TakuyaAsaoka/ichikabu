import { auth } from "../auth";
import { db } from "./index";
import { user } from "./schema";

/** メール＋パスワードのアカウントを表す Better Auth の予約値 */
const CREDENTIAL = "credential";

/**
 * 利用者を1件だけ投入する（設計書 §9）。サインアップは無効なので、画面からは作れない。
 *
 * サインインにはユーザーとパスワードのアカウントの両方が要る。
 * 判定をユーザーの有無ではなくアカウントの有無で行うことで、
 * ユーザーだけ作られた状態で中断しても、次の実行が足りない分を補える。
 *
 * ユーザーだけはテーブルへ直接入れる。`internalAdapter.createUser` は
 * `src/auth.ts` の databaseHooks を通り、そこは「利用者を増やす作成はすべて拒む」
 * ようにしてあるため。**このスクリプトが利用者を作れる唯一の経路** という形にして、
 * Google の初回サインインなど他の経路が増やせないようにしている
 */
export async function seedUser(
  rawEmail: string,
  password: string,
): Promise<{ created: boolean; userId: string }> {
  const ctx = await auth.$context;

  // Better Auth はメールアドレスを小文字にして読み書きする（internal-adapter.mjs の
  // findUserByEmail・findOAuthUser・createUser）。直接 insert する側も揃えないと、
  // SEED_USERS に大文字が入っていたときに、入れた行を誰も見つけられなくなる
  const email = rawEmail.toLowerCase();

  const found = await ctx.internalAdapter.findUserByEmail(email, {
    includeAccounts: true,
  });
  if (found?.accounts.some((a) => a.providerId === CREDENTIAL)) {
    return { created: false, userId: found.user.id };
  }

  const created =
    found?.user ??
    (
      await db
        .insert(user)
        .values({
          id: crypto.randomUUID(),
          email,
          name: email,
          // 運用者本人を手で入れるため、メール確認の経路は用意しない。
          // Google のアカウントが結びつく条件でもある（`src/auth.ts` のコメント参照）
          emailVerified: true,
        })
        .returning()
    )[0];

  await ctx.internalAdapter.createAccount({
    userId: created.id,
    providerId: CREDENTIAL,
    accountId: created.id,
    password: await ctx.password.hash(password),
  });

  return { created: true, userId: created.id };
}
