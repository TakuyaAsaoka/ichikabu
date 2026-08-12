# 配信の手順

実機で使うための配信先を更新する手順（Issue #74）。**本番ではない。** 本番のホスティングは Issue #16 で選定する。

```
iPhone ──https──▶ Netlify（Next.js）──▶ Supabase の PostgreSQL（東京）
```

## 1. デプロイする

**自動デプロイは切ってある。** 無料枠は月300クレジットで、デプロイ1回が15クレジット。自動にすると月20回で尽き、**枠切れでサイトが停止する**（URLに `Site not available` が出る）。まとめて手で実行する。

```
cd server
netlify deploy --build --prod
```

初回は `netlify login` と `netlify link`（サイトを選ぶ）が要る。

**流す前に品質ゲートを通す**（最上位の `CLAUDE.md`）。ビルドが配信先で失敗してもクレジットは戻らない。

## 2. マイグレーションを流す

スキーマを変えたときだけ。**デプロイとは別に、手元から流す。**

```
cd server
DATABASE_URL='<Supabase の接続文字列>' pnpm db:migrate
```

ビルドに混ぜていない理由は、壊れたマイグレーションでサイトごと落とさないため。混ぜると、直すのにもう1回デプロイ（＝15クレジット）が要る。

**順番に注意する。** 列を足すだけなら先にマイグレーション、列を消す・名前を変えるなら先にデプロイ。逆にすると、古いコードが無い列を読む。

## 3. 利用者を投入する

配信先のDBに利用者がいないとサインインできない。最初に1回だけ流す（設計書 §9「ユーザーは1件を手動投入」）。

```
cd server
DATABASE_URL='<Supabase の接続文字列>' \
SEED_USER_EMAIL='<メールアドレス>' \
SEED_USER_PASSWORD='<パスワード>' \
pnpm db:seed
```

何度実行しても増えない。

## 4. クレジットの残量を見る

**枠を使い切るとサイトが止まる。** 消えるのはデプロイ（1回15）だけではなく、転送も食う（1GBあたり20）。

Netlify の画面 → Team → Usage で残量を見る。デプロイの前に確認する。

| 使うもの | 消費 |
|---|---|
| デプロイ1回 | 15クレジット |
| 転送 1GB | 20クレジット |
| 月に配られる量 | 300クレジット |

## 5. 配信先の環境変数

Netlify の画面 → Site configuration → Environment variables に入れる。リポジトリには入れない。

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | Supabase の接続文字列 |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` の出力。**手元の `.env.local` とは別の値にする** |
| `BETTER_AUTH_URL` | 配信先のURL（`https://....netlify.app`） |

`TEST_DATABASE_URL` は入れない。テストは手元でしか流さない。

## 6. iOS アプリの接続先

`ios/Ichikabu/APIClient.swift` の `deployedBaseURL` に配信先のURLを書く。

**シミュレータは手元の開発サーバー、実機は配信先**を見る（`#if targetEnvironment(simulator)` で分けている）。実機から手元のサーバーは見られない。

## 落とし穴

- **Better Auth の秘密鍵を手元と共有しない。** 共有すると、手元で作ったトークンが配信先でも通る
- **Supabase は7日間さわらないと停止する。** 毎日使っていれば止まらないが、しばらく開かないと最初の1回が遅い
- **`pnpm gen` の生成物はコミットしない**（最上位の `CLAUDE.md`）。配信先でも毎回生成される
