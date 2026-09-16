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

DBのコンテナとデータはWorktree間で共有される（compose のプロジェクト名がどのWorktreeでも `server` になるため）。次の3点に注意する。

- 複数のWorktreeで同時にテストを流すと互いのデータを消し合う
- 片方のWorktreeで `db:migrate` すると、共有しているDBのスキーマがもう片方のブランチより先に進む。ブランチを行き来するときは、そのブランチで `db:migrate` を流し直す
- 片方のWorktreeで `server/compose.yaml` のイメージを書き換えて `docker compose up -d` すると、共有しているコンテナがそのイメージで作り直される。まだ書き換えを取り込んでいないWorktreeでは `server/test/image-tag.test.ts` が赤くなる。書き換えたブランチがマージされるまでは赤いままで想定どおり。マージ後は、そのブランチで最新の main を取り込めば直る

## 配信先

iPhone から使う配信先（＝本番）は Netlify（`https://ichikabu.netlify.app`）と Supabase（東京）。**デプロイは自動ではない。手順は `docs/guides/deploy.md`。**

## データベース

**環境は開発と本番の2つだけ。** 検証用の環境は無い。

| 環境 | 場所 | 設定の出どころ |
|---|---|---|
| 開発用 | Docker の PostgreSQL（`server/compose.yaml`、ポート 5434） | `server/.env.local` |
| 本番 | Supabase 東京（iPhone のアプリが見ている実データ） | Netlify の環境変数。Mac から本番DBへ `db:migrate` / `db:seed` するときだけ `server/.env.deploy.local`（`.env.local` の存在も要る。→ `docs/guides/deploy.md`） |

**無料プランのまま使い、線を超えたら有料プランに上げる**（Issue #16 で決めた）。線と根拠は Netlify が `docs/guides/deploy.md` §7、Supabase が `docs/guides/backup.md` §4。**ここに数字を写さない。**

| コマンド | 内容 |
|---|---|
| `pnpm db:generate` | スキーマの変更からマイグレーションを生成する |
| `pnpm db:migrate` | マイグレーションを適用する |
| `pnpm db:seed` | 利用者を1件投入する（何度実行しても増えない） |
| `pnpm db:dump` | バックアップを取る（**本番は週1回、手で実行する**。→ `docs/guides/backup.md`） |
| `pnpm auth:gen` | Better Auth のテーブル定義を再生成する |
| `pnpm import:stat` | 総務省統計局の公表予定から日本CPI を取り込む（**本番は週1回のバックアップと同じ回に手で実行する**。決まった間隔での自動実行は入れない。→ `docs/guides/backup.md`） |

## 管理画面の見た目

**部品は shadcn/ui を使う**（#159 で決めた）。最初は「入力欄3種類のために部品ライブラリを持ち込む量ではない」「使うのは自分1人」として持ち込まなかった。
画面が9枚・フォームが6つ・入力者が3人（#82）になり、ボタンや入力欄の形と色を画面ごとに書き分けるほうが重くなったため覆した。

### 置き場所

| 置き場 | 中身 | 決まり |
|---|---|---|
| `server/components/ui/` | shadcn/ui の部品（`pnpm dlx shadcn add` で入れる） | **部品のコードを書き換えない。** 色と形は `server/app/globals.css` の変数で決める |
| `server/src/` | DB・認証・状態の計算 | React を取り込まない（いま0件）。部品を置かない |

- `@/` は `server/` の直下を指す（`server/tsconfig.json` の `paths` と `server/components.json` の `aliases`）。画面が `server/app` にあるため
- **`card.tsx` は入れて、使わないので消した**（#161 で入れ、#165 で消した）。使う予定だった #165（登録フォームを一覧から分ける）は、押したときだけ開く `<details>` で作った（`server/app/register-details.tsx`）。白い面は背景との明るさの差が 1.07 で、囲いとしても見えない（#163。`server/app/signin/page.tsx`）。戻すのは `pnpm dlx shadcn add card` の1回
- **`table.tsx` は入れて、使わないので消した**（#161）。イベント一覧を表にする案は、720px に収めるのに一覧から項目を落とす必要があり、設計書の決定と衝突したため見送った（→ #172）
- **`shadcn init` は動かない**（`server/` に `next.config.*` が無く「We could not detect a supported framework」で止まる）。`server/components.json` は手で書いてある
- **`shadcn add` は、部品が取り込む包みを全部は足さない。** `button`・`badge`・`alert` の `class-variance-authority`、`native-select` の `lucide-react` などは `pnpm add` で足す（足し忘れは `pnpm typecheck` で落ちる）
- **`shadcn add` は `globals.css` の `@import "shadcn/tailwind.css"` と `@import "tw-animate-css"` も足さない。** 消すとエラーにならずに開閉の見た目だけが効かなくなるので、2行とも消さない（`server/app/globals-css.test.ts` が赤にする）
- **畳まないサイドバーに shadcn の `sidebar` は入れない**（#162）。727行と7つの部品（`sheet`・`tooltip`・`skeleton` 等）を連れてくるが、`collapsible="none"` では Sheet・Ctrl/⌘+B・ツールチップの経路が全部使われない。素の `<aside>` で足りる（`server/app/app-shell/app-shell.tsx`）。開閉とキーボードの扱いが本当に要るアカウントのメニューには `dropdown-menu` を使っている
- **スマホの下のタブの名前から `whitespace-nowrap` を外さない**（#162）。管理者は監査ログが入って5つ並び、390px では1つの中身が 70px になる。「銘柄とテーマ」は 71.6px でこれより広いが、折り返さない指定のおかげでその行だけ縮まずに保たれ、残りが少しずつ譲る（320px まで溢れないことを実測）。外すと2行になり 64px の帯から溢れる
- **`server/biome.json` は `components/ui/**` だけ `noLabelWithoutControl` を切ってある**（#162）。`dropdown-menu` の `DropdownMenuPrimitive.Label` は入力欄を持たない見出しだが、`labelComponents` に `Label` を入れてあるため名前で当たる。部品は書き換えない決まりなので、部品の置き場だけ規則の対象から外した。見たいのは `server/app/` のフォームの入れ子なので、そちらは対象のまま残る
- **`server/biome.json` にコメントを書かない。** biome は設定を読めずに既定へ戻り、エラーが1件から131件に増える（#162 で実測）。理由はこの表に書く

### 色

novel-system の C 案（ネイビー×コーラル。novel-system #49）をそのまま使う。定義は `server/app/globals.css` の `:root`。

**色の役割は shadcn/ui の変数の定義に合わせる**（https://ui.shadcn.com/docs/theming）。独自の役割を作らない。
部品は既定でこの定義どおりに色を付ける（例: 既定のボタンは `primary`）ので、独自の役割を持つと部品を足すたびに既定とぶつかる。
**部品の既定の色の付け方も書き換えない。** 値は16進（`#rrggbb`）で1行ずつ書く（明るさの差を見る `server/app/globals-css.test.ts` が16進しか読まない）。

| 変数 | 値 | 使う所（shadcn の定義） |
|---|---|---|
| `primary` / `primary-foreground` | `#c2452b` / `#ffffff` | 強く目立たせる操作（既定のボタン・選択中の状態） |
| `primary-hover` | `#ae3e27` | 既定のボタンに指を乗せたときの面（#161。→ この節の最後） |
| `secondary` / `secondary-foreground` | `#ecebfb` / `#3a3f8f` | 目立ちの弱い塗りの操作・バッジ |
| `accent` / `accent-foreground` | `#ecebfb` / `#3a3f8f` | 指を乗せた・選んでいる面（ゴーストボタン・メニューの行） |
| `muted` / `muted-foreground` | `#efeff5` / `#5e6178` | 控えめな面と補足の文字（「銘柄なし」「抜けなし」など） |
| `background` / `foreground` | `#f7f7fb` / `#1d1f33` | ページの背景と本文の文字 |
| `card`・`popover`（`-foreground` は `#1d1f33`） | `#ffffff` | 浮いた面（カード・メニュー） |
| `border` | `#e0e0ec` | 面の区切りの枠線 |
| `input` | `#7d8099` | 入力欄・チェックの枠 |
| `ring` | `#3a3f8f` | フォーカスの輪 |
| `destructive` | `#9f1239` | 取り消す・消す・断り・エラーの文 |
| `sidebar` / `sidebar-foreground` | `#1e2a4a` / `#c9cfe3` | サイドバーの面と文字 |
| `sidebar-primary` / `sidebar-primary-foreground` | `#9aa2f0` / `#1e2a4a` | サイドバーの中の強い操作 |
| `sidebar-accent` / `sidebar-accent-foreground` | `#2c3a60` / `#ffffff` | サイドバーの中の指を乗せた・選んでいる行 |
| `sidebar-border` / `sidebar-ring` | `#1e2a4a` / `#9aa2f0` | サイドバーの枠線（面と同じ色で線を見せない）とフォーカスの輪 |

明るさの差（WCAG の式。読みやすさの目安は文字 4.5 以上、形を示す線 3 以上）:

| 組み合わせ | 差 |
|---|---:|
| `foreground` / `background` | 15.16 |
| `primary-foreground` / `primary`（白の文字 / コーラル） | 5.02 |
| `primary-foreground` / `primary-hover`（白の文字 / 指を乗せたコーラル） | 5.97 |
| `primary` / `background`（コーラルの文字 / 背景） | 4.70 |
| `primary` / `muted`（コーラルの文字 / 控えめな面） | **4.39。面の中の文字には使わない** |
| `secondary-foreground` / `secondary` | 7.80 |
| `muted-foreground` / `muted` | 5.30 |
| `muted-foreground` / `background` | 5.68 |
| `destructive` / `background` | 7.50 |
| `destructive` / `destructive` の10%の面（背景の上） | 6.28 |
| `destructive` / `destructive` の20%の面（指を乗せたとき） | 5.21 |
| `sidebar-foreground` / `sidebar` | 9.10 |
| `sidebar-accent-foreground` / `sidebar-accent` | 11.16 |
| `sidebar-primary-foreground` / `sidebar-primary` | 5.93 |
| `ring` / `background`（線） | 8.59 |
| `sidebar-ring` / `sidebar`（線。ネイビーの面の上のフォーカスの輪） | 5.93 |
| `ring` / `sidebar`（線） | **1.54。ネイビーの面の上では `ring` を使わない** |
| `input` / `background`（線） | 3.63 |
| `input` / `muted`（線。面の中の入力欄） | 3.38 |
| `border` / `background`（線） | 1.22 |

**`input` を `border` と同じ値にしない。** 入力欄は背景と同じ色の面なので、欄の形を示すのは枠だけ。
`border` の `#e0e0ec` だと背景との差が 1.22 しかなく、欄の場所が見えない（前の管理画面の枠 `#d1d5db` も白の背景と 1.47 だった）。
枠だけで形を示す操作部品（入力欄・枠だけのボタン）の枠は `input` にする。`border` は区切り線と、中身の並びで形が読める面の枠に使う。

**`destructive` をコーラルに寄せない。** shadcn の部品は `destructive` を塗りではなく「10% の面に `destructive` の文字」で描く（`bg-destructive/10 text-destructive`）。
コーラルに寄せるとこの形で 4.5 を割る（novel-system #49 で 4.10、指を乗せた 20% で 3.54）。

色の見分けやすさは、2色の差（CIE76 の式の ΔE。10 未満は見分けにくい目安）で測った。色覚の型ごとの値は、Machado 2009 の変換で見え方を真似てから測った。

**意味を色だけで運ばない。** コーラルと `destructive` はどちらも赤の系統で、T型の色覚（青と黄が見分けにくい）では差が 12.0 まで縮む（普通の見え方では 28.7）。
削除や抜け・エラーは言葉と記号で伝え、色は添えるだけにする。

**イベントの種類を色で塗るときは測り直す。** `ring`・`secondary-foreground` の `#3a3f8f` は、iOS アプリの「市場」の藍 `#264799`（`ios/Ichikabu/EventLayout.swift` の `Color(red: 0.15, green: 0.28, blue: 0.60)`）とほぼ同じ色に見える（差 6.2）。
いまの管理画面は種類を文字でしか出していない。

**角丸は使う。影は使わない。** `--radius` は `0.5rem`。面の区切りは 1px の枠線。
shadcn の部品が既定で持つ `shadow-xs` などは、部品を書き換えず `globals.css` の `@theme` で影の値を消してある（クラスを書いても何も生成されない）。
フォーカスの輪（`ring-*`）は別の値なので残る。

**フォーカスの輪は `ring` の色で、透かさずに描く**（`globals.css` の `:focus-visible`）。shadcn の既定の `outline-ring/50` だけだと背景との差が 3 を割る。

**部品が「色を薄める」で作る状態は、そのつど測る。** shadcn は指を乗せた・押せない状態を、色を薄めて表すことがある。薄めた面や文字は明るさの差が落ちるので、目安を割ることがある（#161 で2つ見つけた）。部品のコードは書き換えず、`globals.css` か呼ぶ側の `className` で打ち消す。

| 部品の既定 | 何が起きるか | どうしたか |
|---|---|---|
| 既定のボタンの指を乗せた面（`primary` を 80% に薄める） | 白の文字との差が 5.02 → **3.65**。押す直前だけ読めない | `globals.css` で `primary-hover`（暗くした値。5.97）に上書き。`@layer` の外に置かないと部品のクラスに負ける |
| 押せないボタン（半分透かす） | 文字と背景の差が半分になる | 呼ぶ側で `disabled:opacity-100`。押せないことは文字の変化と、指が乗らないことで示す |

**枠だけのボタン（`variant="outline"`）には `border-input` を渡す。** 部品の既定は `border-border` で、背景との差が 1.22 しかなく、ボタンの形が見えない（入力欄と同じ理由）。

この2つの渡し忘れと、消す操作のボタンの色は `server/app/globals-css.test.ts` が赤にする。

**`.dark` の値は持たない**（明るい画面だけ）。ただし `globals.css` の `@custom-variant dark` の行は消さない。
消すと部品の `dark:` が OS の暗い設定で効き、入力欄などだけが暗くなる。

この節の決まり（明るさの差・影・`dark`・2つの `@import`・入力欄の枠）は `server/app/globals-css.test.ts` が守っている。値を変えたら、上の表もその場で測り直す。

## 規約

- `openapi.yaml` がパスとリクエスト・レスポンスの型の唯一の正。サーバー実装からの自動生成はしない
- `openapi-typescript` の生成物（`server/src/generated/`）は**コミットしない**。品質ゲートで毎回 `pnpm gen` が走るため、コミットしても常に再生成される冗長なファイルになるうえ、契約とのズレを生む余地しかない。iOS側の生成物も同様（設計書 §7）
- `server/drizzle/` のマイグレーションと `server/src/db/auth-schema.ts`（Better Auth の生成物）は**コミットする**。前者は適用済みかどうかがDB側の状態と対応する履歴そのもので、再生成すると別物になる。後者は drizzle-kit が全テーブルを1本の履歴で管理するために必要で、これが無いと `DROP TABLE "user"` を含むマイグレーションが生成される
- コードコメント・テストケース名・コミットメッセージは日本語。ファイル名・ディレクトリ名は英語
