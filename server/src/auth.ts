import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
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

// 未設定でも Better Auth は警告を1行出すだけでプロバイダを登録する。
// その状態で「Google でログイン」を押すと、本文の無い 500 が返って原因が分からない。
// 起動時に落として、設定漏れをその場で分かるようにする
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!googleClientId || !googleClientSecret) {
  throw new Error(
    "GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET が設定されていない。取得の手順は docs/guides/google-oauth.md",
  );
}

export const auth = betterAuth({
  secret,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // 利用者は seed スクリプトで手動投入する（設計書 §9）。画面からは作れない。
  // iOS がこの経路を使うため、管理UIを Google に変えても残す
  emailAndPassword: { enabled: true, disableSignUp: true },
  socialProviders: {
    google: { clientId: googleClientId, clientSecret: googleClientSecret },
  },
  // 許可するメールアドレスの一覧は持たない。DBに既に居る利用者としか結びつかないため、
  // 一覧を足すと「入れてよい人」の出典が2つに増えてズレるだけになる。
  // accountLinking も設定しない。既定が最も厳しい（同じメールアドレスで、
  // Google 側もDB側もメール確認済みのときだけ結びつく）
  databaseHooks: {
    user: {
      create: {
        // 利用者を増やせるのは seed スクリプトだけ（設計書 §9）。seed はこのフックを
        // 通らない経路でテーブルに直接入れるので、ここを通る作成はすべて拒む。
        //
        // プロバイダ側の disableSignUp では塞ぎきれない。Better Auth 1.6.26 は
        // /callback/google では provider.options.disableSignUp を見るのに、
        // /sign-in/social に ID トークンを直接渡す経路では provider.disableSignUp を見る。
        // 設定から上がってくるのは前者だけなので（create-context.mjs:103）、
        // 後者の経路は素通りして利用者が作られる。
        // 経路ごとに塞ぐのをやめ、全経路が必ず通るここ1か所で止める
        before: async () => {
          throw new APIError("FORBIDDEN", { message: "signup disabled" });
        },
      },
    },
  },
  rateLimit: {
    // 既定は本番のみ有効。開発中も動かして、制限の効きを検証できる状態にする。
    // サインインは組み込みの規則で10秒に3回まで（設計書 §6）
    enabled: true,
    // 既定のメモリは再起動で消え、サーバーが複数台だと台ごとに別勘定になる
    storage: "database",
  },
  // Web管理UIは Cookie セッション、iOS は Bearer トークン（設計書 §9）。
  // nextCookies は、Server Component から getSession を呼んだときにセッションの
  // 期限延長で Cookie を書こうとして書けない状態（DBだけ進む）を防ぐ。
  // ライブラリが「配列の最後であること」を求めるため、bearer より後に置く
  plugins: [bearer(), nextCookies()],
});
