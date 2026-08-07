/**
 * .env.local を読み込む。
 * drizzle-kit と Vitest は Next.js の外で動くため、環境変数を自前で読む必要がある。
 */
export function loadEnvLocal(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    throw new Error(
      ".env.local が無い。server/ で `cp .env.example .env.local` を実行し、値を埋めること",
    );
  }
}
