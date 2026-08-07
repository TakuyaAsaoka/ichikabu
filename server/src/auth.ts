import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { db } from "./db";
import * as schema from "./db/schema";

// Better Auth は本番以外では、未設定の秘密鍵を公開されている既定値へ黙って差し替える。
// セッションとトークンの署名鍵なので、気づかないまま開発を続けられる状態にしない
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET が設定されていない。`openssl rand -base64 32` の出力を .env.local に入れること",
  );
}

export const auth = betterAuth({
  secret,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // 利用者は1人。ユーザーは seed スクリプトで手動投入する（設計書 §9）
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Web管理UIは Cookie セッション、iOS は Bearer トークン（設計書 §9）
  plugins: [bearer()],
});
