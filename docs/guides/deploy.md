# 配信先へのデプロイ

iPhone から使う配信先は Netlify（Next.js）と Supabase（PostgreSQL・東京）。
設計は `docs/records/specs/2026-08-13-74-deploy-target-design.md`。

```
iPhone ──https──▶ https://ichikabu.netlify.app ──▶ Supabase 常用DB（東京）
Mac    ──http───▶ next dev                     ──▶ Docker 開発用DB
```

**デプロイは自動ではない。** main にマージしても配信先は変わらない。下記の手順を手で実行したときだけ変わる。

## 1. 毎回のデプロイ手順

```bash
# 1. マイグレーションを先に流す（配信先の値は .env.production.local。§3 を参照）
cd server
set -a && . ./.env.production.local && set +a
pnpm db:migrate

# 2. デプロイする。リポジトリの最上位から実行する
cd ..
pnpm --package=netlify-cli dlx netlify deploy --build --prod
```

順番を守る。**デプロイを先にすると、新しいコードが古いテーブルを触りにいく。**

**デプロイは `server/` ではなくリポジトリの最上位から実行する。** `netlify.toml` が最上位にあり、`server/` から実行すると見つからず `base` が効かない。

`--build` はビルドをこのMacで実行してから成果物だけを送る。Netlify 側でビルドしないため、ビルドの失敗で配信先が壊れることがない。

初回だけ、ブラウザ認証とサイトの紐付けが要る。

```bash
# リポジトリの最上位で実行する
pnpm --package=netlify-cli dlx netlify login
pnpm --package=netlify-cli dlx netlify link --name ichikabu
```

`--name` を省くと、対話できない環境では「どのサイトか指定しろ」と言われて止まる。紐付けの結果は `.netlify/` に入る（`.gitignore` 対象。作業する人ごとに実行する）。

netlify-cli は依存に足していないので、`pnpm dlx` が実行のたびに取ってくる。**`--package=netlify-cli` を省くと `netlify-cli has multiple binaries` で止まる**（`ntl` と `netlify` の2つがあり、どちらを実行するか決められないため）。

### 確認

```bash
curl https://ichikabu.netlify.app/api/health
# {"status":"ok"}
```

## 2. 使う環境変数

`BETTER_AUTH_SECRET` は Netlify と `.env.production.local` で**同じ値**にする。ずれるとデプロイのたびに全セッションが無効になる。

| 変数 | Netlify | `.env.production.local` | 値 |
|---|---|---|---|
| `DATABASE_URL` | 要る | 要る | **入口が違う。下の §4 を参照** |
| `BETTER_AUTH_SECRET` | 要る | 要る | `openssl rand -base64 32`。開発用とは別の値 |
| `BETTER_AUTH_URL` | 要る | 要らない | `https://ichikabu.netlify.app` |
| `SEED_USER_EMAIL` | 要らない | 要る | サインインに使うメールアドレス |
| `SEED_USER_PASSWORD` | 要らない | 要る | サインインに使うパスワード |

Netlify 側は Project configuration > Environment variables に入れる。

## 3. `server/.env.production.local`

配信先の値を置くファイル。`.gitignore` の `.env*.local` に当たるのでコミットされない。**Worktree を作り直したときや別のマシンで作業するときは、手で作り直す。**

```
DATABASE_URL=<Supabase の Session pooler・:5432>
BETTER_AUTH_SECRET=<openssl rand -base64 32 の出力>
SEED_USER_EMAIL=<サインインに使うメールアドレス>
SEED_USER_PASSWORD=<サインインに使うパスワード>
```

## 4. Supabase の接続URLは用途で使い分ける

Supabase のダッシュボード上部の **Connect** に3つ並んでいる。**どれを使うかで届く・届かないが変わる。**

| 用途 | 使う入口 | ポート |
|---|---|---|
| Netlify に入れる `DATABASE_URL` | Shared Pooler の **Transaction** | **6543** |
| Mac から `pnpm db:migrate` / `pnpm db:seed` | Shared Pooler の **Session** | **5432** |
| （使わない）直接接続 | `db.<プロジェクトID>.supabase.co` | 5432 |

- **Transaction** は接続をすぐ返すため、呼ばれるたびに立ち上がる Netlify の関数に向く
- **Session** は借りたら切るまで自分専用。テーブルを作り変えるマイグレーションはこちらでないと安定しない
- **直接接続は使えない。** 2024年1月15日以降に作ったプロジェクトは IPv6 でしか名前が引けず、Netlify から届く保証がない

## 5. 初回だけの準備

### Supabase

1. https://supabase.com/dashboard で **New project**
2. Region は **Northeast Asia (Tokyo)**、Plan は Free
3. Database Password は画面が生成するものを控える（接続URLに埋め込む）
4. セキュリティの設問は**3つとも OFF**。このアプリはデータAPI（PostgREST）を使わず、`drizzle-orm` + `pg` で直接つなぐ。使わない入口は開けない

> データAPIを OFF にすると、ログに `schema "pg_pgrst_no_exposed_schemas" does not exist` が30秒ごとに出る。Supabase の既知の挙動で無害（PostgREST が停止しないため）。

### Netlify

1. https://app.netlify.com で **Add new project** → GitHub の `ichikabu` を選ぶ
2. **Build & deploy > Continuous deployment > Build settings で `Stop builds` を選ぶ**。これをしないと main に push するたびに15クレジット減る。この状態でも §1 の CLI からのデプロイは動く
3. **General > Project details > Change site name** でサイト名を決める。`https://<サイト名>.netlify.app` になる
4. Deploy log visibility は **Private**。ビルドログには環境変数の名前とパスが出る
5. 環境変数を3つ入れる（§2）

ビルド設定（base・command・publish）は `netlify.toml` に書いてあるので、画面で入れ直す必要はない。

### 利用者の投入

配信先のDBに1件だけ利用者を作る。このアプリには新規登録の画面が無い（`server/src/auth.ts` の `disableSignUp: true`）。

```bash
cd server
set -a && . ./.env.production.local && set +a
pnpm db:migrate
pnpm db:seed
```

サンプルの銘柄・イベントも一緒に入る。要らなければ管理UI（`https://ichikabu.netlify.app`）から消す。

## 6. iOS の接続先を切り替える

`ios/Ichikabu/APIClient.swift` の `baseURL` がビルド構成で切り替わる。

| ビルド構成 | 接続先 |
|---|---|
| Debug | `http://localhost:3000`（Macの `next dev`） |
| Release | `https://ichikabu.netlify.app` |

実機で配信先を使うときは、Xcode の **Scheme > Run > Build Configuration** を **Release** にする。Debug のままだと iPhone 自身の3000番を指すため届かない。

## 7. クレジット残量の見方

Netlify の無料プランは**月300クレジット**。**使い切るとサイトが止まり、次の請求期間まで戻らない**（URLに「Site not available」が出る）。

残量は Netlify の **Usage & billing** で見る。50%・75%・100% でメールとアプリ内の通知も届く。

| 消費するもの | 単価 |
|---|---|
| 本番へのデプロイ | 15クレジット／回 |
| 帯域 | 20クレジット／GB |
| コンピュート（Functions・SSR） | 10クレジット／GB時 |
| Webリクエスト | 2クレジット／1万件 |

**1日1回開く使い方では、デプロイ以外はほぼ減らない。** 実質、月20回のデプロイが上限になる。まとめて実行する。

## 8. 開発用DBと常用DBは別

| | 開発用 | 常用 |
|---|---|---|
| 場所 | Mac の Docker（`server/compose.yaml`・ポート5434） | Supabase（東京） |
| 読む設定ファイル | `.env.local` | `.env.production.local` |
| 作り直し | `docker compose down -v` していつでも | しない |

開発用を作り直しても常用のデータは残る。Netlify のサイトは1つで、常に常用DBだけを見る。
