# 配信の手順

実機で使うための配信先を用意し、更新する手順（Issue #74）。**本番ではない。** 本番のホスティングは Issue #16 で選定する。

```
iPhone ──https──▶ Netlify（Next.js）──▶ Supabase の PostgreSQL（東京）
```

---

## 初回だけやること

**上から順に実行する。** 順番を入れ替えると、環境変数が無いまま配信されて最初のアクセスで落ちる（`server/src/db/index.ts` と `server/src/auth.ts` が読み込み時に投げる）。

### 1. Supabase のプロジェクトを作る

[Supabase](https://supabase.com/) でプロジェクトを作る。**リージョンは Tokyo。**

Project Settings → Database で接続文字列を2種類とも控える。**用途が違う。**

| 用途 | 使うもの | 理由 |
|---|---|---|
| Netlify の実行時（`DATABASE_URL`） | transaction pooler（ポート **6543**） | 都度立ち上がる関数から繋ぐため |
| 手元から流すマイグレーション・投入 | direct connection（ポート **5432**） | drizzle-kit のような管理ツール向け。IPv6 だけの場合があり、繋がらなければ session pooler を使う |

### 2. Netlify CLI を入れる

```
npm install -g netlify-cli
```

`server/package.json` には入れない。配信のための道具で、アプリの依存ではない。

### 3. Netlify のサイトを作り、名前を押さえる

```
netlify login
netlify sites:create --name ichikabu
```

**名前は先着。** `ichikabu.netlify.app` は 2026-08-12 時点で未取得（404）。取れなければ取れた名前を控え、手順7で使う。

続けてリポジトリと繋ぐ。最上位で実行する。

```
netlify link
```

### 4. 自動デプロイを止める

**これをやらないと、main に push するたび15クレジット減って月20回で枠が尽きる**（→ 「クレジットの残量を見る」）。

Netlify の画面 → Project configuration → Build & deploy → Continuous deployment → Build settings → Configure → **Build status を Stopped builds** にする。

止めても、下の手順どおり手元でビルドして手で配信することはできる。

### 5. 配信先の環境変数を入れる

Netlify の画面 → Project configuration → Environment variables。リポジトリには入れない。

| 変数 | 値 |
|---|---|
| `DATABASE_URL` | Supabase の **transaction pooler**（6543） |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` の出力。**手元の `.env.local` とは別の値にする** |
| `BETTER_AUTH_URL` | 配信先のURL（`https://ichikabu.netlify.app`） |

`TEST_DATABASE_URL` は入れない。テストは手元でしか流さない。

`BETTER_AUTH_URL` を入れれば、そのURLが信頼するオリジンにも入る。別に設定する必要は無い。

### 6. マイグレーションと利用者を流す

手元から、配信先のDBに向けて流す。**direct connection（5432）を使う。**

```
cd server
DATABASE_URL='<direct connection>' pnpm db:migrate
DATABASE_URL='<direct connection>' SEED_USER_EMAIL='<メール>' SEED_USER_PASSWORD='<パスワード>' pnpm db:seed
```

**`db:seed` は利用者だけでなく、確認用の銘柄3件・保有3件・イベント約26件（FOMC・米CPI等）も入れる**（`server/src/db/seed-event.ts`）。要らなければ管理UIから消す。何度実行しても増えない。

### 7. iOS の接続先を書き換える

`ios/Ichikabu/APIClient.swift` の `deployedBaseURL` を、手順3で取れた名前に合わせる。

**手順3より前に実機ビルドしないこと。** サイトを押さえる前だと、サインインのメールアドレスとパスワードを自分のものでないホストに送ることになる。

---

## 2回目以降

### デプロイする

**自動デプロイは手順4で止めてある。** まとめて手で実行する。

```
netlify deploy --build --prod
```

リポジトリの最上位で実行する（`netlify.toml` の `base` が `server` を指しているため、ビルドは `server/` で走る）。

**流す前に品質ゲートを通す**（最上位の `CLAUDE.md`）。配信先でビルドが失敗してもクレジットは戻らない。

### マイグレーションを流す

スキーマを変えたときだけ。**デプロイとは別に、手元から流す。**

```
cd server
DATABASE_URL='<direct connection>' pnpm db:migrate
```

ビルドに混ぜていない理由は、壊れたマイグレーションでサイトごと落とさないため。混ぜると、直すのにもう1回デプロイ（＝15クレジット）が要る。

**順番に注意する。** 列を足すだけなら先にマイグレーション、列を消す・名前を変えるなら先にデプロイ。逆にすると、古いコードが無い列を読む。

### クレジットの残量を見る

**枠を使い切るとサイトが止まる**（URLに `Site not available` が出る）。消えるのはデプロイだけではなく、転送も食う。

Netlify の画面 → Team → Usage。デプロイの前に見る。

| 使うもの | 消費 |
|---|---|
| デプロイ1回 | 15クレジット |
| 転送 1GB | 20クレジット |
| 月に配られる量 | 300クレジット |

---

## 落とし穴

- **Better Auth の秘密鍵を手元と共有しない。** 共有すると、手元で作ったトークンが配信先でも通る
- **Supabase は7日間さわらないと停止する。自動では戻らない。** 画面から手で復帰させるまでアプリは使えない。毎日使っていれば止まらない
- **`pnpm gen` の生成物はコミットしない**（最上位の `CLAUDE.md`）。配信先でも毎回生成される
- **接続文字列を取り違えない。** 実行時は 6543、手元からの流し込みは 5432
