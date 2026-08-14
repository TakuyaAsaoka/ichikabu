# イチカブ

持ち株に関連するイベント（決算・経済指標・テーマ関連イベント）をカレンダーで見るiOSアプリ。
設計書: `docs/records/specs/2026-08-02-1-ichikabu-design.md`

## リポジトリ構成

```
<repo>/
├── openapi.yaml   ← パスとリクエスト・レスポンスの型の唯一の正（手書き）
├── ios/           ← Xcode プロジェクト（Swift + SwiftUI）
└── server/        ← Next.js（管理UI + API Route Handlers）
```

pnpm workspace は使わない。pnpm は `server/` の中だけで回す。

## 品質ゲート

GitHub Actions の CI は使わない。**ローカル検証がマージ前の唯一のゲート**（設計書 §11）。

### server（実行ディレクトリ: `server/`）

前提:

- Node が 24 であること（`server/` で `nvm use`）。`.nvmrc` は `nvm use` を実行しないと効かない。配信先も Node 24 で動くため、違うバージョンで検証しても意味がない
- 開発用DBが起動していること（`docker compose up -d`）。テストが実際のPostgreSQLに対して制約を検証するため

```
pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint
```

`gen` が `openapi.yaml` から型を再生成するため、`typecheck` が契約整合の検証を兼ねる。

### ios（実行ディレクトリ: `ios/`）

前提: Xcode の iOS プラットフォームがインストールされていること（`xcodebuild -downloadPlatform iOS`）。入っていないと `xcodebuild` が iOS シミュレータを1件も見つけられず、コマンド自体が動かない。シミュレータのランタイムが既にあっても、これとは別に必要。

```
xcodebuild build test -scheme Ichikabu -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

ビルド時に `openapi.yaml` から Swift の型が再生成されるため、このコマンドが契約整合の検証を兼ねる。

- `-skipPackagePluginValidation`: swift-openapi-generator のビルドプラグインを信頼する。Xcode はプラグインの初回利用時に画面で確認を求めるが、`xcodebuild` にはその画面が無く、付けないと `Validate plug-in "OpenAPIGenerator"` で止まる
- 端末名: `-destination` に OS を書かないと、インストール済みで最も新しいランタイムから探される。そこに無い端末名（iOS 26.3 における `iPhone 16` 等）を指定すると「端末が見つからない」で止まるため、新しいランタイムに存在する名前を使う。Xcode を上げると使える名前が変わるので、止まったら `xcodebuild -showdestinations -scheme Ichikabu` で確認して読み替える

## worktree環境準備

`.env.local` は `.gitignore` 対象のためWorktreeに含まれない。Worktree作成後、`server/` で以下を実行する。

```
cp .env.example .env.local
# BETTER_AUTH_SECRET に `openssl rand -base64 32` の出力を入れる
# SEED_USERS を埋める（JSON の配列。入力者を増やすときは要素を足す）
# ADMIN_EMAIL を埋める（削除できる管理者。SEED_USERS のどれかと同じにする。
#   未設定だとサーバーが起動時に落ちる）
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を埋める（未設定だとサーバーが起動時に落ちる）。
#   Google でのログインを実際に試さないなら、品質ゲートを回すだけなら任意の文字列でよい。
#   本物の値の取り方は docs/guides/google-oauth.md
nvm use
docker compose up -d --wait
pnpm install && pnpm db:migrate && pnpm db:seed
```

`--wait` はDBが受け付けられる状態になるまで待つ。初回はデータベースの初期化に数秒かかり、待たずに `db:migrate` すると接続に失敗する。

DBのコンテナとデータはWorktree間で共有される（compose のプロジェクト名がどのWorktreeでも `server` になるため）。次の2点に注意する。

- 複数のWorktreeで同時にテストを流すと互いのデータを消し合う
- 片方のWorktreeで `db:migrate` すると、共有しているDBのスキーマがもう片方のブランチより先に進む。ブランチを行き来するときは、そのブランチで `db:migrate` を流し直す

## 配信先

iPhone から使う配信先（＝本番）は Netlify（`https://ichikabu.netlify.app`）と Supabase（東京）。**デプロイは自動ではない。手順は `docs/guides/deploy.md`。**

## データベース

**環境は開発と本番の2つだけ。** 検証用の環境は無い。

| 環境 | 場所 | 設定の出どころ |
|---|---|---|
| 開発用 | Docker の PostgreSQL（`server/compose.yaml`、ポート 5434） | `server/.env.local` |
| 本番 | Supabase 東京（iPhone のアプリが見ている実データ） | Netlify の環境変数。Mac から本番DBへ `db:migrate` / `db:seed` するときだけ `server/.env.deploy.local`（`.env.local` の存在も要る。→ `docs/guides/deploy.md`） |

Issue #16 は**環境を増やす話ではなく、本番を今の Netlify + Supabase から別のところへ載せ替えるかの選定**（収益化を前提にしたとき。設計書 §1.1 でプラットフォーム選定は保留）。

| コマンド | 内容 |
|---|---|
| `pnpm db:generate` | スキーマの変更からマイグレーションを生成する |
| `pnpm db:migrate` | マイグレーションを適用する |
| `pnpm db:seed` | 利用者を1件投入する（何度実行しても増えない） |
| `pnpm auth:gen` | Better Auth のテーブル定義を再生成する |
| `pnpm import:stat` | 総務省統計局の公表予定から日本CPI を取り込む（月1回を目安に手で実行する。→ `docs/records/specs/2026-08-12-64-import-stat-schedule-design.md`） |

## 規約

- `openapi.yaml` がパスとリクエスト・レスポンスの型の唯一の正。サーバー実装からの自動生成はしない
- `openapi-typescript` の生成物（`server/src/generated/`）は**コミットしない**。品質ゲートで毎回 `pnpm gen` が走るため、コミットしても常に再生成される冗長なファイルになるうえ、契約とのズレを生む余地しかない。iOS側の生成物も同様（設計書 §7）
- `server/drizzle/` のマイグレーションと `server/src/db/auth-schema.ts`（Better Auth の生成物）は**コミットする**。前者は適用済みかどうかがDB側の状態と対応する履歴そのもので、再生成すると別物になる。後者は drizzle-kit が全テーブルを1本の履歴で管理するために必要で、これが無いと `DROP TABLE "user"` を含むマイグレーションが生成される
- コードコメント・テストケース名・コミットメッセージは日本語。ファイル名・ディレクトリ名は英語
