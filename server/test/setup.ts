import { afterAll, vi } from "vitest";

/**
 * テストファイルが読み込まれる前に走る前置き（`vitest.config.ts` の `setupFiles`）。
 *
 * ここに置く前は、**12本**が `next/headers` の差し替えを、**うち3本**が
 * `ADMIN_EMAIL` の差し替えも書き写していた。さらに12本とも、その差し替えより
 * **後**に `src/auth` などを読ませるために `await import(` を並べていた
 * （Issue #138）。
 *
 * **`await import(` が要ったのは、差し替えより後に読ませるためだけ。** `vi.mock` も
 * `vi.stubEnv` も、ここに書けばどのテストが読み込まれるより前に済むので、
 * テスト側は素の `import` に戻せる。
 */

// 画面と Server Action は `next/headers` の `headers()` を呼ぶが、これは Next.js の
// リクエストの中でしか動かない。テストが自分で入れた Headers を返す形に差し替える。
//
// セッションは差し替えない。`test/render-page.ts` の `signInAs` が、この `current` を
// 「本物の Better Auth のトークンを Cookie に持つ Headers」へ丸ごと差し替える。
// セッションの側を差し替えると、画面が本当にサインインを見ているかを確かめられなくなる
export const requestHeaders = { current: new Headers() };

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

// `src/admin.ts` は読み込みの時点で `ADMIN_EMAIL` を読む。読み込む前に入れる。
//
// 入れると、テストの結果が `.env.local` の中身に左右されなくなる。
// 大文字を混ぜてあるのは、`seedUser` がメールアドレスを小文字にして入れるためで、
// 揃えずに比べると設定に大文字が1つ入っただけで管理者が誰も居なくなる。
// `stubEnv` で入れるのは、テストファイルをまたいで値を持ち越さないため。
//
// **1本だけ別の値にする道は塞がる。** そのファイルで `vi.stubEnv` →
// `vi.resetModules()` → `await import(` の順を踏み直すことになり、ここへ寄せて
// 消したはずの並べ替えを1本ぶん戻すことになる。今そういうテストは無い
// （未設定なら `src/admin.ts` が読み込みの時点で落ちるが、それを確かめる
// テストも無い）。要るようになったら、そのとき形を決める
vi.stubEnv("ADMIN_EMAIL", "Admin@Example.com");

afterAll(() => {
  vi.unstubAllEnvs();
});
