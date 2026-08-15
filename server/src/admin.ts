/**
 * 管理者は1人で、役割はメールアドレスの一致だけで決める（入力者を3人にする設計書 §2・§9）。
 * 未設定のまま動かすと、誰も管理者にならず削除が全部拒まれる状態に静かになる。
 * `src/auth.ts` の秘密鍵と同じく、読み込みの時点で落とす
 */
const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
if (!adminEmail) {
  throw new Error(
    "ADMIN_EMAIL が設定されていない。削除できる管理者のメールアドレスを .env.local に入れること",
  );
}

/**
 * 管理者かどうか。
 *
 * `app/actions.ts` に置かない。あのファイルは "use server" で、公開できるのは
 * 非同期の関数だけ（Next.js 同梱ドキュメント 01-app/01-getting-started/07-mutating-data.md）。
 * 監査ログの画面（`app/audit/page.tsx`）も同じ判定が要るため、両方から読める場所へ出す。
 * 判定を画面側で書き写すと、管理者の決め方が2か所になってズレる
 */
export function isAdmin(email: string): boolean {
  // seedUser がメールアドレスを小文字にして入れるため、比較も小文字で揃える
  return email.toLowerCase() === adminEmail;
}
