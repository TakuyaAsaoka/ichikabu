# 管理UI（銘柄・保有の登録）設計書

- 対応 Issue: [#6 管理UI: 銘柄・保有の登録](https://github.com/TakuyaAsaoka/ichikabu/issues/6)
- 根拠: [全体設計書](2026-08-02-1-ichikabu-design.md)（§4 データモデル・§5.1 出典ポリシー・§9 認証・§11 品質ゲート・§12 初回リリースに含めないもの）、[イベント取得API設計書](2026-08-08-3-events-api-design.md)

## 1. 目的と結論

**銘柄（`stock`）と保有（`holding`）を画面から登録できるようにする。目的は Issue #7 でイベントを登録できる状態を作ること。** `server/app/` には route handler が3本あるだけで `.tsx` が1つも無い（`layout.tsx` も `page.tsx` も無い）ため、これがこのプロジェクト最初の画面になる。サインイン画面も込みで作る。

| 項目 | 決定 |
|---|---|
| スコープ | `stock` と `holding` の登録だけ。theme / theme_stock は別Issueに切り出す（→ §2） |
| 画面 | `/`（登録フォーム＋一覧）と `/signin` の2ページ（→ §3） |
| 登録処理 | Server Action → `src/db/register.ts`。事前確認せず INSERT し、制約違反を日本語に訳す（→ §5） |
| 認証 | Cookie セッション（全体設計書 §9）。`auth.ts` に `nextCookies()` を足す（→ §6） |
| 見た目 | Tailwind v4。部品ライブラリは持ち込まない（→ §8） |
| テスト | `src/db/register.test.ts` で実際の PostgreSQL に対して8件（→ §9） |

## 2. スコープ: theme / theme_stock を外す

**Issue #6 の対象から theme / theme_stock の登録画面を外し、Issue #27 に切り出す。** 全体設計書 §5.1 で出典を「各社IRページ1つだけ」に絞った結果、テーマイベントが登録できない。テーマの登録画面を作っても紐づけ先のイベントが無く、動作確認もできない。出典を増やしてテーマイベントが登録できるようになった時点で作る。

**Issue #6 の本文と完了条件はこの決定に合わせて書き換える必要がある。** 書き換え前の本文は theme / theme_stock を「やること」に含み、完了条件にも「テーマ・テーマ所属も同様に」の項があった。実装に入る前に本文を直した（→ §11 順1、Issue #27）。

### `seed-event.ts` は残す

`server/src/db/seed-event.ts` はそのまま残す。iOS の目視確認用データ（Issue #8 設計書 §3 の3銘柄・3イベント）を一発で戻す手段として使い続ける。`onConflictDoNothing` で何度実行しても増えないため、画面からの手入力と衝突しない。

| 手段 | 役割 |
|---|---|
| `pnpm db:seed`（`seed-event.ts`） | 確認用データを戻す手段 |
| 管理UI（本設計） | 本来の登録手段 |

## 3. 画面構成

| パス | 中身 |
|---|---|
| `/` | 銘柄フォーム → 銘柄一覧 → 保有フォーム → 保有一覧 を縦に並べた1ページ |
| `/signin` | メールアドレスとパスワード |

一覧に削除・編集は付けない。並べ替え・絞り込み・ページ送りも付けない。銘柄は数十件で、Issue #6 の目的（Issue #7 の前提データを入れる）に読む機能は要らない。Issue 補足の「一覧・編集・削除は最小限でよい」の「最小限」を「登録の確認に使える一覧だけ」と決める。

**保有はサインインしている利用者のものだけを扱う。** `holding` は `user_id` と `stock_id` の複合主キー（全体設計書 §4.2）なので、どちらの列も画面から入力させない。

| 列 | どこから来るか |
|---|---|
| `holding.user_id` | `auth.api.getSession` が返すセッションの利用者。画面に入力欄を出さない |
| `holding.stock_id` | 保有フォームの `<select>` |

保有一覧も同じ利用者の行だけを出す。利用者は当面1人（全体設計書 §12）だが、`user_id` を固定値や「最初の1件」で代用すると、利用者が増えたときに他人の保有が混ざる。セッションから取る形を最初から採る。

### 入力欄はブラウザの検証を使う

`stock.name` は `notNull` だが空文字 `""` を弾く CHECK が無く、空のまま INSERT が成功してしまう。CHECK 制約を足す代わりに、HTML の属性で空入力を塞ぐ。

| 欄 | 入力方法 |
|---|---|
| market | `<select>` で JP / US |
| ticker | `<input required>` |
| name | `<input required>` |
| fiscal_month | `<select>` で 空 と 1〜12 |
| 保有の銘柄 | `<select>` に登録済みの銘柄を出す |

`<select>` にすることで、`stock_market_check`（JP/US 以外を弾く）と `stock_fiscal_month_check`（1〜12 以外を弾く）は通常の操作では踏まなくなる。ただし ticker の形式や market×fiscal_month の組み合わせのように HTML では表せない制約は残るため、制約違反の日本語化（→ §5）は別途必要になる。

## 4. ファイル構成と責務

```
server/
├── postcss.config.mjs        ← 新規（→ §8）
├── biome.json                ← css.parser.tailwindDirectives を足す（→ §8）
├── package.json              ← devDependency に tailwindcss と @tailwindcss/postcss
├── app/
│   ├── globals.css           ← 新規
│   ├── layout.tsx            ← 新規
│   ├── page.tsx              ← 新規
│   ├── actions.ts            ← 新規。"use server"
│   └── signin/page.tsx       ← 新規
└── src/db/
    ├── register.ts           ← 新規。createStock / createHolding
    └── register.test.ts      ← 新規
```

この一覧に加えて、フォームだけを切り出した `"use client"` のファイルが3つ増える（`app/signin/signin-form.tsx`・`app/stock-form.tsx`・`app/holding-form.tsx`）。`useActionState` は Client Component でしか使えないため。ページ本体は Server Component のまま残す。

責務の分け方:

| ファイル | 責務 |
|---|---|
| `src/db/register.ts` | DB への INSERT と、制約違反の日本語化（→ §5）。**Vitest のテスト対象はここだけ** |
| `app/actions.ts` | 認証の確認（→ §6）、FormData の読み取り、`register.ts` の呼び出し、`revalidatePath("/")` |

`register.ts` はセッションを読まない。`createHolding` は `user_id` を引数で受け取る（→ §3）。セッションを読むのは `app/actions.ts` の側だけにして、`register.ts` を Vitest から呼べる形に保つ。

分ける理由: Server Action は `next/headers` を使うため Vitest から呼べない。DB 操作を `src/db/` に出せば、実際の PostgreSQL に対して制約の検証ができる（既存の `src/db/schema.test.ts` と同じやり方）。イベント取得API設計書 §6 は「クエリを別モジュールに切り出さない」と逆の判断をしたが、あちらはハンドラが `request.headers` だけで動き Vitest から直接呼べた。Server Action はそれができないため、テストしたい部分を切り出す。

## 5. 登録の失敗の扱い

**事前に存在確認せず INSERT し、PostgreSQL が返した制約違反を日本語に訳す。** 確認してから入れる形は、確認と INSERT の間に別の登録が割り込むと漏れるうえ、DB が既に持っている判定をアプリ側に写すことになる。

`server/test/helpers.ts` の `violatedConstraint()`（エラーの `cause` を辿って制約名を取り出す関数）を `src/db/` に移し、テストと `register.ts` の両方から使う。

制約名と画面に出す文の対応（制約名は `server/drizzle/0000_simple_blacklash.sql` の実物）:

| 制約名 | 画面に出す文 |
|---|---|
| `stock_market_ticker_unique` | その市場のティッカーは登録済み |
| `stock_ticker_check` | ティッカーは半角の数字・英大文字・ピリオド・ハイフンだけ使える |
| `stock_fiscal_month_market_check` | 決算月はJP銘柄にだけ入れられる |
| `stock_fiscal_month_check` | 決算月は1〜12 |
| `holding_user_id_stock_id_pk` | その銘柄はすでに保有に登録済み |

表に無い制約名のエラーは投げ直す（500になる）。握りつぶすと、理由が出ないまま失敗する画面になるため。

`createStock` / `createHolding` の戻り値は**成功で `null`、失敗でメッセージ文字列**。この値が `useActionState` の状態にそのまま入り、フォームの直下に表示される。

## 6. 認証

| 決定 | 内容 |
|---|---|
| `src/auth.ts` の変更 | `plugins` を `[bearer(), nextCookies()]` にする。`nextCookies` は**配列の最後**に置く（`node_modules/better-auth/dist/integrations/next-js.mjs` の `warnIfCookiePluginNotLast` が最後でないと警告を出す） |
| 画面の保護 | `app/page.tsx` で `auth.api.getSession` を呼び、セッションが無ければ `redirect("/signin")` |
| Server Action の保護 | `app/actions.ts` の各アクションでも同じ確認をする。Server Action は画面を通さず直接 POST できるため（Next.js 同梱ドキュメント `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` の警告） |
| サインイン | `/signin` の Server Action から `auth.api.signInEmail` を呼ぶ |

補足2点:

- **Better Auth の Origin 検査は問題にならない。** Server Action から `auth.api.signInEmail` を直接呼ぶと HTTP を経由しないので `ctx.request` が無く、`node_modules/better-auth/dist/api/middlewares/origin-check.mjs` の `validateOrigin` が先頭で return する。`BETTER_AUTH_URL=http://localhost:3000` は `.env.example` に既にある
  - ただし直接呼び出しには代償もある。Better Auth のレート制限は `auth.handler`（HTTP層）を通るリクエストにしかかからない仕組みで、`node_modules/better-auth/dist/api/index.mjs` の router の `onRequest` にある。`/api/auth/sign-in/email` への直接POSTには制限がかかるが、この Server Action 経由のサインインには回数制限がかからず、公開後はパスワード総当たりに無防備になる。未デプロイ・利用者1人のうちは実害が無いが、公開前に対処が要る。対処はホスティング選定の Issue #16 の範囲とする
- **`nextCookies()` を足しても既存テスト（`app/api/events/route.test.ts` 等）は壊れない。** `next-js.mjs` の after フックは「リクエストの外で `cookies()` が呼ばれた」を catch して素通りする

## 7. 実装時に踏む穴

先に分かっている4つ。実装時にここへ戻って確認する。

| | 内容 | 対処 |
|---|---|---|
| A | **空欄の `fiscal_month` をそのまま INSERT すると 500 になる。** HTML フォームの空欄は FormData で `""` になり、smallint への INSERT は型変換エラーで落ちる。これは制約違反ではないので §5 の対応表のどれにも当たらず、投げ直して 500 になる。完了条件「US銘柄で空にできること」に直撃する | `app/actions.ts` で `""` → `null` に読み替える |
| B | サインインの失敗表示は §5 とは別系統。`auth.api.signInEmail` はパスワード誤りで例外を投げる | catch して「メールアドレスまたはパスワードが違います」を返す |
| C | `redirect("/")` を B の catch の中に入れると、成功したのにエラー表示になる。`redirect` は例外を投げて制御を移す仕組みのため | `redirect("/")` は catch の外に置く |
| D | `holding.user_id` は Better Auth の `user` への外部キー。`test/helpers.ts` の `resetDatabase()` は `user` も消すので、保有のテストは先に利用者を作らないと外部キー違反で落ちる | `app/api/events/route.test.ts` の `createUser` と同じく `seedUser` で利用者を作ってから登録する |

## 8. 見た目: Tailwind v4

入れるもの:

| 追加 | 中身 |
|---|---|
| devDependency | `tailwindcss`、`@tailwindcss/postcss` |
| `postcss.config.mjs` | プラグインは `@tailwindcss/postcss` だけ |
| `app/globals.css` | `@import "tailwindcss";` と `@theme` に色5つ（背景・文字・薄い文字・境界・エラー） |
| `biome.json` | `"css": { "parser": { "tailwindDirectives": true } }` |

`tailwind.config.js` は作らない（v4 では不要）。

**`biome.json` の変更は必須。** 無いと `pnpm lint`（品質ゲート）が `globals.css` の `@theme` を未知の記法として落とし、後続の作業が全部止まる（→ §11 順2）。参考にした別プロダクト kabu-legends の `biome.json` は、`tailwindDirectives: true` に加えて `**/*.css` に `noUnknownAtRules: "off"` の例外も置いている。実装時にどちらまで要るかを `pnpm lint` の結果で確かめる。

### kabu-legends から吸収しないもの

Tailwind の設定は kabu-legends を参考にするが、以下は持ち込まない。

| もの | 理由 |
|---|---|
| `@klbb/ui`（shadcn 系の部品37個） | `cva` + `clsx` + `tailwind-merge` + Radix が付いてくる。入力欄3種類のために持ち込む量ではない |
| `PageHeader` 部品 | 見出しと説明文を渡すだけ。`<h1>` を1つ書けば済む |
| `sonner`（トースト通知） | エラーはフォームの直下に出す。通知は消えるが、フォームの直下ならエラーが残り続け、どの入力に対する失敗かも分かる |
| `lucide-react`（アイコン） | 管理画面に要らない |
| タイポグラフィのスケール8段 | Tailwind 既定の `text-sm` / `text-base` / `text-xl` で足りる |
| ダークモード固定 | 切り替えを作らないなら既定のままでよい |
| タブインデント | イチカブは既にスペース2。`server/biome.json` の既存設定に合わせる |
| tRPC | イチカブの契約は `openapi.yaml` が唯一の正（全体設計書 §8）。相手が Swift なので tRPC の型共有も効かない。全体設計書 §7 の「持ち込まないもの」にも入っている |

### 共通のフォーム部品を先に作らない

フォームは銘柄・保有・サインインの3つで、サインインだけ挙動が違う（成功でリダイレクト、→ §7 C）。**まず銘柄フォームを1つ書き、2つ目で重複が見えてから括り出す。** 最初から「共通の枠」を設計すると、3つしかないフォームの差分を吸収する引数が先に生まれる。

## 9. テスト

`server/src/db/register.test.ts` で実際の PostgreSQL に対して検証する（`schema.test.ts` と同じやり方）。テストケース名は日本語。全8件。

| # | テスト | 固定する挙動 |
|---|---|---|
| 1 | 銘柄を登録するとDBに行が入る | `createStock` が `null` を返し、`stock` に行がある |
| 2 | 同じ市場とティッカーをもう一度登録するとエラー文が返る | `stock_market_ticker_unique` の訳文が返る |
| 3 | 英字入りのティッカー `130A` を登録できる | 完了条件「§4.2『ticker は文字列』の検証」そのもの |
| 4 | 全角のティッカーはエラー文が返る | `stock_ticker_check` の訳文が返る |
| 5 | US銘柄に決算月を入れるとエラー文が返る | `stock_fiscal_month_market_check` の訳文が返る |
| 6 | US銘柄は決算月なしで登録できる | 完了条件「US 銘柄で空にできること」。5 と対で、CHECK が US＋NULL を通すことを固定する |
| 7 | 保有を登録するとDBに行が入る | `createHolding` が `null` を返し、`holding` に行がある |
| 8 | 同じ銘柄をもう一度保有に登録するとエラー文が返る | `holding_user_id_stock_id_pk` の訳文が返る |

7・8 は §7 D のとおり、先に `seedUser` で利用者を作る。

完了条件「未認証で管理UIにアクセスするとサインイン画面に誘導される」は自動テストにしない。`page.tsx` は `next/headers` を使うため Vitest から呼べず（→ §4）、ブラウザ側の自動化を持ち込むほどの分岐でもない。目視確認（→ §10）で確かめる。

## 10. 目視確認の手順

1. `server/` で `docker compose up -d --wait && pnpm db:migrate && pnpm db:seed` を流し、`pnpm dev` でサーバーを起動する
2. ブラウザのシークレットウィンドウ（Cookie が無い状態）で `http://localhost:3000/` を開き、`/signin` に移ることを確認する
3. `.env.local` の `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` でサインインし、`/` に移ることを確認する
4. 誤ったパスワードでサインインし、「メールアドレスまたはパスワードが違います」がフォームの下に出ることを確認する（→ §7 B）
5. 銘柄フォームで JP・`7203` を登録し、「その市場のティッカーは登録済み」が出ることを確認する（seed が同じ銘柄を入れているため。500 にならないこと）
6. 銘柄フォームで US・`AAPL`・Apple を決算月なしで登録し、銘柄一覧に増えることを確認する（→ §7 A の検証。500 にならないこと）
7. 保有フォームで `AAPL` を選んで登録し、保有一覧に増えることを確認する
8. もう一度 `AAPL` を保有に登録し、「その銘柄はすでに保有に登録済み」が出ることを確認する

確認できたら、結果をこの節に表で追記する（Issue #8 設計書 §7 手順4 と同じ形式）。

### 結果（実施日: 2026-08-09）

**ブラウザは別セッションが占有していたため使えなかった。** 上記1〜8はブラウザではなく、実際に起動したサーバーに対する HTTP リクエスト（`curl` 等）で代わりに確認した。

| # | 確認したこと | 結果 |
|---|---|---|
| 1 | 未認証で `GET /` | 307 で `/signin` に飛ぶ |
| 2 | `GET /signin` | 200。`name="email"` と `name="password"` の入力欄が描画される |
| 3 | `POST /api/auth/sign-in/email`（`Origin: http://localhost:3000` 付き、正しいパスワード） | 200。`better-auth.session_token` の Cookie が付く。403 にならない |
| 4 | 同上、誤ったパスワード | 401 |
| 5 | 3 で得た Cookie を付けて `GET /signin` | 307 で `/` に飛ぶ（サインイン済みの判定が効いている） |
| 6 | 同 Cookie で `GET /` | 200。「イチカブ 管理」の見出しと「銘柄を登録」「銘柄一覧（3件）」「保有を登録」「保有一覧（3件）」の4ブロックが描画される |
| 7 | 6 の一覧の中身 | `JP 6367 ダイキン工業 / 3月決算`・`JP 7203 トヨタ自動車`・`JP 9434 ソフトバンク`。DBの `stock` 3行と一致し、市場・ティッカーの順に並ぶ。保有の `<select>` にも同じ3件が出る |
| 8 | サインインの Server Action に `Next-Action` ヘッダで直接到達 | アクションが実行され、認証に失敗したときは「メールアドレスまたはパスワードが違います」を返す。500 にならない |

**まだ確認できていないこと**（ブラウザが空き次第、実ブラウザで確認する）:

| # | 確認したいこと | 未確認の理由 |
|---|---|---|
| 1 | 実ブラウザでのフォーム送信（銘柄の登録・保有の登録） | Chrome が別セッションに占有されていた |
| 2 | 重複登録したときのエラー文が画面に出ること | 同上 |
| 3 | 登録後に一覧が増えること（`revalidatePath("/")` の効き） | 同上 |
| 4 | サインインのフォーム送信で `nextCookies()` が Cookie を書くこと | 同上 |

## 11. やる順番

| 順 | やること | 根拠 |
|---|---|---|
| 1 | Issue #6 の本文を書き換える（theme / theme_stock を外す。→ §2） | 完了条件が変わる。古い完了条件のまま実装すると、作らないと決めたテーマ画面が「未完了」として残り続ける |
| 2 | Tailwind の導入と `biome.json` の変更（→ §8） | 先にやらないと、`.tsx` と `.css` を書くたびに `pnpm lint` が落ち、後の全部が止まる |
| 3 | `layout.tsx` ＋ `/signin` ＋ サインインの Server Action | 認証が無いと `/` の保護（→ §6）が書けず、以降の動作確認がすべてサインインを前提にする |
| 4 | `page.tsx` ＋ `actions.ts` ＋ `src/db/register.ts` | 本体 |
| 5 | `src/db/register.test.ts`（→ §9） | 4 の `register.ts` が対象 |
| 6 | 見た目を整える | 完了条件のどれにも見た目は出てこない（Issue 補足も「画面の見た目に凝らない。利用者=運用者=自分」）。先に整えると 4・5 の手戻りで捨てる |
| 7 | 品質ゲート（`CLAUDE.md` の server の節にあるコマンド全部）が exit 0 | マージ前の唯一のゲート（全体設計書 §11） |

## 12. やらないこと

| 対象 | 理由 |
|---|---|
| theme / theme_stock の登録画面 | Issue #27 に切り出す（→ §2） |
| イベントの登録画面 | Issue #7 |
| 一覧の削除・編集・並べ替え・絞り込み・ページ送り | → §3 |
| 共通フォーム部品の先行設計 | → §8 |
| `stock.name` の空文字を弾く CHECK 制約の追加 | HTML の `required` で塞ぐ（→ §3）。管理UI以外の書き込み経路は seed だけで、seed は固定値を入れる |
| write 系 API の `openapi.yaml` への追加 | 管理UIは Next.js 内（Server Action）で完結する。iOS が読む read 系だけを契約に載せる（イベント取得API設計書 §8） |
| サインアウト | 利用者=運用者=自分の1人（全体設計書 §12）。セッションを消したければブラウザの Cookie を消せば足りる |
