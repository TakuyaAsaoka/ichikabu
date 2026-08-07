import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // 利用者は1人。ユーザーは seed スクリプトで手動投入する（設計書 §9）
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Web管理UIは Cookie セッション、iOS は Bearer トークン（設計書 §9）
  plugins: [bearer()],
});
