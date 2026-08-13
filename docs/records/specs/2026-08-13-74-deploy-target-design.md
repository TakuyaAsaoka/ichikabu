# 開発用と実機での常用をまかなう配信先を立てる（Issue #74）

iOS アプリの接続先は `http://localhost:3000` に固定されていて、実機では自分自身を指すため届かない。Netlify に Next.js を上げ、DBを Supabase に置き、iPhone から使える状態にする。

Issue #16（収益化を前提とした本番のホスティングとDBの選定）は保留のまま。ここは、その判断材料（利用頻度）を取るための足場。

## 1. 決めたこと

Issue #74 の「残る判断」5件の結論。

| # | 判断 | 結論 | 理由 |
|---|---|---|---|
| 1 | 配信先DBへのマイグレーション | 手で流す。`( set -a; . ./.env.deploy.local; set +a; pnpm db:migrate )` | コードの変更が要らない。Node の `--env-file` と `process.loadEnvFile` はどちらも既にある環境変数を上書きしないため、シェルで渡した値が `.env.local` より優先される（実測で確認）。デプロイ自体が手動なので、手順が1行増えるだけで済む |
| 2 | iOS の接続先の切り替え | `#if DEBUG` で2分岐。Debug は `localhost:3000`、Release は配信先 | 追加ファイルなし・ビルド設定の変更なし。切り替えは Xcode の Scheme > Run > Build Configuration で行う |
| 3 | サイトとDBの数 | Netlify サイト1つ（常用）、Supabase プロジェクト1つ（常用）。開発用DBは今までどおりローカルの Docker | デプロイのクレジット消費が最小。「開発用DBを作り直しても常用DBのデータが残る」はこの形でも満たせる |
| 4 | 配信先の利用者の投入 | 同じく `.env.deploy.local` を読ませて `pnpm db:seed` | コードの変更が要らない。**`DATABASE_URL` だけを渡してはいけない。** `SEED_USER_EMAIL` と `SEED_USER_PASSWORD` が `.env.local`（開発用）から読まれ、エラーも出ずに常用DBへ開発用の利用者が作られる。サンプルの銘柄・イベントも一緒に入るが、管理UIから消せる（Issue #68） |
| 5 | クレジット残量の見方 | `docs/guides/deploy.md` に Netlify の Usage & billing の見方を書く | コードを書く必要がない。50%・75%・100% でメールとアプリ内の通知も届く |

## 2. 配信の構成

```
iPhone ──https──▶ Netlify（Next.js）──▶ Supabase 常用DB（東京）
Mac    ──http───▶ next dev          ──▶ Docker 開発用DB（今までどおり）
```

Netlify のサイトは1つだけ。開発は今までどおりローカルで行う。

## 3. Supabase の接続URLは用途で使い分ける

Supabase は接続の入口を3つ用意している。**どれを使うかで届く・届かないが変わる。**

| 用途 | 使う入口 | ポート | 理由 |
|---|---|---|---|
| Netlify から | Shared Pooler の transaction mode | 6543 | サーバーレスの短命な接続向けと公式が書いている。IPv4 で届く |
| Mac からマイグレーション・seed | Shared Pooler の session mode | 5432 | 公式が「IPv4だけの回線では直接接続の代わりに session mode を使う」と書いている |
| （使わない）直接接続 | `db.<プロジェクトID>.supabase.co` | 5432 | 2024年1月15日以降に作ったプロジェクトは IPv6 でしか名前が引けない。Netlify から届く保証がない |

### transaction mode の制限は当たらない

Supabase は transaction mode について「prepared statements（同じSQLに名前を付けてサーバー側に覚えさせる仕組み）は使えない」と書いている。**このリポジトリは影響を受けない。**

- 名前付きの prepared statement を作る `.prepare(` が、`server/src`・`server/app`・`server/scripts` に1件も無い
- Better Auth の drizzle アダプタ（`node_modules/better-auth/dist/adapters/drizzle-adapter/index.mjs`）にも1件も無い
- drizzle の `node-postgres` 実装は、名前が渡されないと名前を付けずにSQLを送る

## 4. Netlify のビルド設定

新しく `netlify.toml` をリポジトリの最上位に置く。

```toml
[build]
  base = "server"
  command = "pnpm gen && pnpm build"
  publish = ".next"
```

### base を server にしても `../openapi.yaml` は読める

`base` は「依存を入れてビルドコマンドを走らせるディレクトリ」を指すだけで、**clone されるのはリポジトリ全体**。`pnpm gen`（`openapi-typescript ../openapi.yaml`）は base の1つ上を読むが、そこにファイルは存在する。

Issue #74 の「ビルドの起点をリポジトリ最上位にしないと通らない」は、確認した結果あたらなかった。

### Next.js のアダプタは明示的に宣言する

```toml
[[plugins]]
  package = "@netlify/plugin-nextjs"
```

**これを書かないと動かない。** 設計の時点では「Netlify が自動で当てるので不要」と判断していたが、配信先で試して誤りだと分かった。

- Netlify のCIでビルドする場合は、フレームワークの自動検出がアダプタを当てる
- **この構成は `netlify deploy --build` でMacでビルドして送るため、自動検出が働かない**
- 宣言が無いと `.next` が静的ファイルとして上がるだけになり、`/api/health` を含む全経路が404になる（実測）

バージョンは固定しない。公式がアダプタのバージョン固定を勧めていない。Next.js 16 への対応は changelog に名指しで書かれている。

### ローカルビルドは依存を自動で入れない

Netlify のCIは `pnpm install` を自動で走らせるが、`netlify deploy --build` は走らせない。**デプロイの前に `server/` で `pnpm install` を済ませておく。**

### Worktree からはデプロイできない

netlify-cli はリポジトリの起点を探すときに、Worktree の `.git`（ファイル）を辿ってメインcheckoutに行き着く。その結果 `base = "server"` がメインcheckoutの `server/` に解決され、そちらでビルドしてしまう。

**デプロイはメインcheckout（またはふつうのクローン）から実行する。** 配信するのは main にマージ済みのものなので、運用上これで困らない。

### 自動デプロイは Netlify の画面で止める

`netlify.toml` では止められない。Project configuration > Build & deploy > Continuous deployment > Build settings の **Stop builds** を選ぶ。この状態でも CLI でローカルビルドして手でデプロイする経路は動くと公式ドキュメントに書かれている。

### サイトは既定で非公開

2026年7月28日以降に作ったチームは、新しいサイトが既定で非公開になる。チームにログインした人しか開けず、実機からは401が返る。Project configuration > General > Project visibility を **Public** にする。

## 5. Node と pnpm のバージョンを固定する

Netlify は指定が無ければ自前の既定バージョンを使う。ローカルと違うバージョンで動くと、ローカルの品質ゲートを通ったものがデプロイで落ちる。

| 対象 | 固定する場所 | 値 | 効き方 |
|---|---|---|---|
| Node | `server/.nvmrc`（新規） | `24` | ローカルは `nvm use` が読む。Netlify も base ディレクトリの `.nvmrc` を最優先で読む。**1ファイルで両方をまかなう** |
| pnpm | `server/package.json` の `packageManager` | `pnpm@10.33.2` | Netlify は Corepack でこのバージョンを取ってくる。範囲指定（`^10`）は Corepack の制限で書けない |

Node 24 は 2026年8月13日時点の最新のLTS（v24.19.0、Krypton）。26 はまだ Current で、LTS になるのは10月。

あわせて2つ直す。

- `server/package.json` の `engines.node` を `>=20.12` から `>=24` へ。バージョンの出典を1つにする
- `server/package.json` の `@types/node` を `^26.1.2` から `^24` へ。**実行するより新しいバージョンの型が入っていると、Node 24 に無いAPIを書いても typecheck が通ってしまう**

## 6. iOS の接続先

`ios/Ichikabu/APIClient.swift:19` を書き換える。

```swift
/// 接続先。Debug はローカルの `next dev`、Release は配信先を見る。
/// 実機で配信先を使うときは Xcode の Scheme > Run > Build Configuration を Release にする
static let baseURL: URL = {
	#if DEBUG
		return URL(string: "http://localhost:3000")!
	#else
		return URL(string: "https://<サイト名>.netlify.app")!
	#endif
}()
```

`openapi.yaml` の `servers` は変えない。iOS は生成された型だけを使い、通信は手で書いているため、`servers` の値はどこからも読まれない。

`server/.env.example` には**値を足さない**。配信先の値は Netlify の環境変数と `.env.deploy.local` に入れるので、リポジトリには入らない。ただし置き場所が分かるように、末尾に案内を追記する。**Issue #74 の検証が見る9行目（`BETTER_AUTH_URL`）を動かさないよう、追記は末尾に置く。**

### 配信先の値を置くファイル名は `.env.deploy.local`

`.env.production.local` にしてはいけない。**Next.js が自動で読むファイル名だから。**

`next build` は `NODE_ENV=production` で走り、`.env.production.local` → `.env.local` → `.env.production` → `.env` の順に読む（先に読んだものが勝つ）。つまりこの名前にすると、**ローカルの `pnpm build`（品質ゲート）が常用DBの `DATABASE_URL` を拾う。**

実測で確認した。`.env.local` を外して `pnpm build` を実行すると、

- `.env.production.local` という名前のとき: **通る**（配信先の値を読んでいる）
- `.env.deploy.local` に変えたとき: 落ちる（`DATABASE_URL` の出どころが無い）

今は全ページが動的でビルド中にDBへつながないため実害は出ていないが、静的生成するページを1枚足した時点でローカルのビルドが常用DBを見にいく。`NODE_ENV` が `deploy` になることはないので、この名前なら Next.js は拾わない。

## 7. `docs/guides/deploy.md` に書くこと

| 節 | 内容 |
|---|---|
| 初回の準備 | Supabase でプロジェクトを作る（東京リージョン）／Netlify でサイトを作り GitHub とつなぐ／**Stop builds を選んで自動デプロイを止める**／Netlify の環境変数を3つ入れる |
| Netlify に入れる環境変数 | `DATABASE_URL`（transaction mode・6543）・`BETTER_AUTH_SECRET`・`BETTER_AUTH_URL`（`https://<サイト名>.netlify.app`） |
| マイグレーションの流し方 | `( set -a; . ./.env.deploy.local; set +a; pnpm db:migrate )` |
| 利用者の投入 | 同じ形で `pnpm db:seed`。サンプルの銘柄・イベントも入るので、要らなければ管理UIから消す |
| デプロイの手順 | `pnpm --package=netlify-cli dlx netlify deploy --build --prod`。**先にマイグレーションを流してからデプロイする**。実行する場所と前提（メインcheckout・`nvm use`・`pnpm install`）も書く |
| クレジットの見方 | Netlify の Usage & billing。無料は月300。内訳と枠切れの挙動（次の8節） |
| iOS の切り替え | Xcode の Scheme > Run > Build Configuration を Debug と Release で切り替える |

netlify-cli は依存に足さない。デプロイのときだけ `pnpm dlx` で取ってくる。

## 8. クレジットの見積もり

無料プランは月300クレジット。単価は次のとおり。

| 消費するもの | 単価 |
|---|---|
| 本番へのデプロイ | 15クレジット／回 |
| 帯域 | 20クレジット／GB |
| コンピュート（Functions・SSR） | 10クレジット／GB時 |
| Webリクエスト | 2クレジット／1万件 |

**1日1回開く使い方では、デプロイ以外はほぼ減らない。** 1日あたりの通信は数リクエスト・数十KBで、月に足しても1クレジットに届かない。つまり月20回のデプロイが上限になる。

枠を使い切るとサイトは一時停止になり、次の請求期間まで戻らない。50%・75%・100% の時点でメールとアプリ内の通知が届く。

## 9. 検証

| 受け入れ条件 | 確かめ方 |
|---|---|
| 「検証」の手順が「あるべき姿の出力」と一致する | Issue #74 のコマンドを再実行する |
| `/api/health` が実機の回線から 200 を返す | iPhone のブラウザで `https://<サイト名>.netlify.app/api/health` を開く |
| iPhone でサインインしてカレンダーにイベントが出る | Mac の `next dev` と Docker を止めた状態で、Release ビルドのアプリを実機で動かす |
| 開発用DBを作り直しても常用DBのデータが残る | ローカルで `docker compose down -v` してから常用DBを見る |
| デプロイ手順とクレジットの見方が `docs/guides/deploy.md` にある | ファイルを読む |
| 品質ゲートが全パスする | **Node 24 に切り替えたうえで** `server/` の全コマンドを流す |

## 10. やらないこと

| やらないこと | 理由 |
|---|---|
| 開発用の Supabase プロジェクト | 開発用DBはローカルの Docker で足りている。増やすと管理する場所が増えるだけ |
| Netlify サイトを2つ立てる | デプロイのクレジットが2倍かかる |
| 自動デプロイ | 月20回で枠が尽き、サイトが止まる |
| マイグレーションをビルドに混ぜる | 適用に成功したあとビルドが落ちると、DBだけ新しく、動いているコードが古い状態になる |
| Netlify の環境変数の切り替えで開発用DBを見る | 切り替えのたびに再デプロイ（15クレジット）が要る |
| Issue #16（本番のプラットフォーム選定） | 保留のまま。判断材料（想定規模・利用頻度）が未確定 |
