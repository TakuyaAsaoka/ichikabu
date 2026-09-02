# 管理UI（銘柄・保有の登録）設計書

> **保有に関する記述はもう当たらない。** [ログイン廃止 設計書](2026-08-14-86-no-login-design.md) §5.1 で `holding` テーブルごと消えた。 §3 の `/` から「保有フォーム → 保有一覧」が消え、§5 の `holding_*` の訳文2つも消えた。銘柄・テーマ・テーマ所属・イベントの側はそのまま生きている。

- 対応 Issue: [#6 管理UI: 銘柄・保有の登録](https://github.com/TakuyaAsaoka/ichikabu/issues/6)
- 根拠: [全体設計書](2026-08-02-1-ichikabu-design.md)（§4 データモデル・§5.1 出典ポリシー・§9 認証・§11 品質ゲート・§12 初回リリースに含めないもの）、[イベント取得API設計書](2026-08-08-3-events-api-design.md)

## 1. 目的と結論

**銘柄（`stock`）と保有（`holding`）を画面から登録できるようにする。目的は Issue #7 でイベントを登録できる状態を作ること。** `server/app/` には route handler が3本あるだけで `.tsx` が1つも無い（`layout.tsx` も `page.tsx` も無い）ため、これがこのプロジェクト最初の画面になる。サインイン画面も込みで作る。

| 項目 | 決定 |
|---|---|
| スコープ | `stock` と `holding` の登録だけ。theme / theme_stock は別Issueに切り出す（→ §2） |
| 画面 | `/`（登録フォーム＋一覧）と `/signin` の2ページ（→ §3） |
| 登録処理 | Server Action → `src/db/register.ts`。事前確認せず INSERT し、制約違反を日本語に訳す（→ §5） |
| 認証 | Cookie セッション（全体設計書 §9）。**サインインはブラウザから HTTP エンドポイントを叩く**（回数制限を効かせるため）。`auth.ts` に `nextCookies()` と `rateLimit` を足す（→ §6） |
| 見た目 | Tailwind v4。部品ライブラリは持ち込まない（→ §8） |
| テスト | `src/db/register.test.ts` で実際の PostgreSQL に対して8件（→ §9） |

## 2. スコープ: theme / theme_stock を外す

**Issue #6 の対象から theme / theme_stock の登録画面を外し、Issue #27 に切り出す。** 全体設計書 §5.1 で出典を「各社IRページ1つだけ」に絞った結果、テーマイベントが登録できない。テーマの登録画面を作っても紐づけ先のイベントが無く、動作確認もできない。出典を増やしてテーマイベントが登録できるようになった時点で作る。

> **この前提は誤りだった。** テーマイベントのうち、決算のように各社IRで日付を確認できる出来事をテーマに寄せたものは、出典を増やさなくても登録できる。Issue #38 で全体設計書 §5・§5.1 を直し、Issue #27 で登録画面を作った（→ [2026-08-11-27-theme-registration-design.md](2026-08-11-27-theme-registration-design.md) §2）。

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

> **イベントについては Issue #43 でこの判断を取り消した。** 出典の記載を条件とする出典（Issue #41）を使い始め、出典の表示名が入っていない行が規約の条件を満たさない行になったため、画面から直せる必要が出た。イベント一覧の各行から編集ページ `/events/[id]` へ行けるようにし、そこで編集と削除ができる。詳細は[イベントの編集・削除 設計書](2026-08-11-43-edit-event-design.md)。
>
> **銘柄とテーマも Issue #67 で同じ形にした**（`/stocks/[id]` と `/themes/[id]`）。詳細は[銘柄とテーマの編集・削除 設計書](2026-08-12-67-edit-stock-theme-design.md)。
>
> **保有とテーマ所属は Issue #68 で削除だけを付けた**（`/holdings/[stockId]` と `/themes/[id]/stocks/[stockId]`）。主キー以外の列が無いため編集は存在しない。詳細は[保有とテーマ所属の削除 設計書](2026-08-12-68-delete-holding-theme-stock-design.md)。**これで5テーブルすべてが画面から消せるようになり、この節の「一覧に削除・編集は付けない」は全面的に取り消された。**

> **画面は2枚ではなくなった。** Issue #110 で `/status`（状態）を足した。「画面が2枚しかないためナビゲーションは置かない」という根拠も一緒に捨て、`/signin` を包んでいるという理由に置き換えた（→ [状態画面の設計書](2026-08-15-110-admin-status-screen-design.md) §4）。

**保有はサインインしている利用者のものだけを扱う。** `holding` は `user_id` と `stock_id` の複合主キー（全体設計書 §4.2）なので、どちらの列も画面から入力させない。

| 列 | どこから来るか |
|---|---|
| `holding.user_id` | `auth.api.getSession` が返すセッションの利用者。画面に入力欄を出さない |
| `holding.stock_id` | 保有フォームの `<select>` |

保有一覧も同じ利用者の行だけを出す。利用者は~~当面1人~~**いま3人**（全体設計書 §12）で、`user_id` を固定値や「最初の1件」で代用すると他人の保有が混ざる。セッションから取る形を最初から採る。

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

この一覧に加えて、フォームだけを切り出した `"use client"` のファイルが3つ増える（`app/signin/signin-form.tsx`・`app/stock-form.tsx`・`app/holding-form.tsx`）。ページ本体は Server Component のまま残す。

切り出す理由はフォームごとに違う。銘柄と保有は `useActionState` が Client Component でしか使えないため。サインインは `fetch` でHTTPエンドポイントを叩くため（→ §6）。

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

> 2026-08-11 追記（Issue #46・#49）: この関数は `pgError()` になり、制約名に加えて pg のエラーコードも返す。ファイル名も中身に合わせて `src/db/pg-error.ts` にした。

制約名と画面に出す文の対応（制約名は `server/drizzle/0000_simple_blacklash.sql` の実物）:

| 制約名 | 画面に出す文 |
|---|---|
| `stock_market_ticker_unique` | その市場のティッカーは登録済み |
| `stock_ticker_check` | ティッカーは半角の数字・英大文字・ピリオド・ハイフンだけ使える |
| `stock_fiscal_month_market_check` | 決算月はJP銘柄にだけ入れられる |
| `stock_fiscal_month_check` | 決算月は1〜12 |
| `holding_user_id_stock_id_pk` | その銘柄はすでに保有に登録済み |

表に無い制約名のエラーは投げ直す（500になる）。握りつぶすと、理由が出ないまま失敗する画面になるため。

> **2026-08-11 追記（Issue #46）: 列に入らない値のエラーも日本語にする**
>
> - **何が起きていたか**: 画面から来る値はすべて文字列で、`Number()` が数字でない文字列を `NaN` に、桁数の多い文字列をそのままの数にする。どちらも integer 列には入らない。日付・時刻の `""` も同じ。制約違反ではないため上の表を通らず、500 になっていた
> - **どう直したか**: pg のエラーコードが `22` で始まるもの（渡した値が列に入らないというまとまり。数の範囲外・形式違い・日付や時刻の形式違いと範囲外がすべて入る）を「入力に使えない値がある」の1文にする。どの列で起きたかは pg のエラーから取れないため、文言は列ごとに分けない。制約違反は `23`、接続断は `08` で、どちらもここには当たらず今までどおり投げ直す
> - **残すもの**: `event.id` の `isEventId`（イベントの編集・削除 設計書 §6）。編集ページの読み取りは INSERT や UPDATE を通らないため、この日本語化では覆えない

> **2026-08-11 追記（Issue #49）: 外部キー違反も表に入れる**
>
> 存在しないIDを指したときのエラーも日本語にする（決定の経緯はイベント登録フォーム設計書 §6 の追記）。この節が扱う保有の分は次の1つ。
>
> | 制約名 | 画面に出す文 |
> |---|---|
> | `holding_stock_id_stock_id_fk` | その銘柄は無い |
>
> `holding_user_id_user_id_fk` は入れない。利用者IDはセッションから来るため画面からは届かず、サインイン中に利用者が消えた場合にしか出ない。ここに「その銘柄は無い」のような文を出すと嘘になる。
>
> **この文は INSERT と UPDATE のときの意味**。`holding_stock_id_stock_id_fk` は `ON DELETE restrict` で、銘柄を消す機能を足すと、参照されている銘柄を消したときにも同じ制約名が返る。そのときの意味は「その銘柄は保有に使われていて消せない」で正反対になるため、削除の経路は別扱いにする。

`createStock` / `createHolding` の戻り値は**成功で `null`、失敗でメッセージ文字列**。この値が `useActionState` の状態にそのまま入り、フォームの直下に表示される。

## 6. 認証

| 決定 | 内容 |
|---|---|
| **サインイン** | **ブラウザから `POST /api/auth/sign-in/email` を叩く**（`app/signin/signin-form.tsx`）。サーバー側の `auth.api.signInEmail` は呼ばない |
| 画面の保護 | `app/page.tsx` で `auth.api.getSession` を呼び、セッションが無ければ `redirect("/signin")` |
| Server Action の保護 | `app/actions.ts` の各アクションでも同じ確認をする。Server Action は画面を通さず直接 POST できるため（Next.js 同梱ドキュメント `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` の警告） |
| `src/auth.ts` の変更 | ~~`plugins` を `[bearer(), nextCookies()]` にし、~~ **`plugins` は `[nextCookies()]` だけ**（`bearer()` は iOS のログインと一緒に消えた → [ログイン廃止 設計書](2026-08-14-86-no-login-design.md) §5）。`rateLimit: { enabled: true, storage: "database" }` を足す |

### なぜサインインだけ HTTP エンドポイントを叩くのか

**Better Auth のレート制限は `auth.handler`（HTTP層）を通るリクエストにしかかからない。** 公式ドキュメントが「`auth.api` で作ったサーバー側リクエストはレート制限の対象外」と明記しており、実装上も `node_modules/better-auth/dist/api/index.mjs` の router の `onRequest` に置かれている。

当初は Server Action から `auth.api.signInEmail` を呼んでいた（Better Auth の Next.js 連携ドキュメントが例示している形）。この形は Origin 検査を通らない利点がある一方、**回数制限も通らない**。公開後はパスワード総当たりを遅くする手段が無くなる。

そこで、認証情報を検証する操作だけ HTTP エンドポイントに寄せた。**セッションを読むだけの `auth.api.getSession` はそのまま使う**（読み取りに回数制限をかけると自分のページ表示が止まる。かつ Better Auth が公式に用意しているサーバー側の入口である）。

~~副次的に、iOS も同じ `POST /api/auth/sign-in/email` を使う（全体設計書 §9）ため、**両方のクライアントが1つの認証入口を共有する**形になった。~~

> **この段落はもう当たらない。** iOS のログインは消えた（→ [ログイン廃止 設計書](2026-08-14-86-no-login-design.md) §5）。`/api/auth/*` を叩くのは管理UIだけで、iOS が使うのは `/api/events`・`/api/stocks` の2本
（`/api/health` はアプリからは叩かない。確かめるのは人で、手段は curl と iPhone のブラウザ。→ Issue #136）。よって**この節のレート制限の話は、すべて管理UIの利用者3人だけに関わる**。

| 操作 | 経路 | レート制限 |
|---|---|---|
| サインイン | ブラウザ → `POST /api/auth/sign-in/email` | かかる（組み込み規則で10秒に3回。IPごとか全員で1枠かは下の「IPで絞るかの決着」を見る） |
| セッションの読み取り | `auth.api.getSession` | かからない（かけない） |
| 銘柄・保有の登録 | Server Action | かからない（認証済みの操作なので不要） |

### レート制限の設定

| 設定 | 値 | 理由 |
|---|---|---|
| `enabled` | `true` | 既定は本番のみ有効。開発中も動かさないと、制限が外れていることを検証で捕まえられない（実際に一度取りこぼした） |
| `storage` | `"database"` | 既定の `memory` は再起動で消え、サーバーが複数台だと台ごとに別勘定になる。公式も「メモリはサーバーレスに不適」としている |
| サインインの回数 | 設定しない | 組み込みの規則が `/sign-in*` を10秒に3回に絞っている（`node_modules/better-auth/dist/api/rate-limiter/index.mjs` の `getDefaultSpecialRules`）。公式が言う「機密操作を厳しく」は既定で満たされる |

`storage: "database"` は `rate_limit` テーブルを要求する。`pnpm auth:gen` で `src/db/auth-schema.ts` を再生成し、マイグレーション `drizzle/0001_nice_venus.sql` を追加した。

**デプロイ時の注意**: サインインがブラウザからのHTTPリクエストになったため、Better Auth の Origin 検査を通るようになった。デプロイ先のオリジンと `BETTER_AUTH_URL`（または `trustedOrigins`）が食い違うと**サインインが全件 403 になる**。Server Action 経由だった頃は検査を通らなかったので、この条件は今回から増えたものである。

### IPで絞るかの決着（Issue #106）

配信先が Netlify に決まった（→ Issue #74）ので、先送りしていた2つを決めた。

**本番のログとDBはまだ見ていない。**つまり「いま本番でクライアントIPが取れているか」は分かっていない。見ずに決めてよいと判断したのは、**取れていてもいなくても下の2つの結論が変わらない**ため。理由は後ろの表で示す。

| 決めたこと | 結論 |
|---|---|
| 管理UIの入口をIPで絞るか | **絞らない** |
| `advanced.ipAddress.ipAddressHeaders` に Netlify のヘッダを足すか | **足さない**（設定は既定のまま） |

**入口を絞らない理由**: 入口はもう閉じている。利用者は seed でしか作れず（§9）、画面からは増やせない。IPの一覧を置くと「入れてよい人」の出どころが2つに増えて食い違う。加えて管理UIは iPhone からも使うため、回線が変わるたびに自分が入れなくなる。Netlify の無料プランに入口のIP制限は無く、自前でやるなら `middleware.ts` を新しく作ることになる。

**ヘッダを足さない理由**: 足すと、いま止められている総当たりが止められなくなる。

Better Auth は `x-forwarded-for` に値が1つだけのときそれを使い、カンマ区切りで2つ以上入っていると誰からのリクエストか決められず、`no-trusted-ip` という共通の鍵にまとめる（`@better-auth/core/dist/utils/ip.mjs` の `getIPFromHeader`、`better-auth/dist/api/rate-limiter/index.mjs` の `NO_TRUSTED_IP_KEY`）。Netlify が案内している `x-nf-client-connection-ip` を候補の先頭に足せば値が1つで読めるが、**このヘッダをクライアントが自分で書いて送ってきたとき Netlify が捨てる、という記述が公開資料に無い**。捨てないなら、リクエストごとに違う値を書くだけで鍵が変わり、`/sign-in/email` の「10秒に3回」を素通りできる。`getIp` を実際に呼んで確かめた。

候補の並びを入れ替えて `x-forwarded-for` を先、`x-nf-client-connection-ip` を後ろにしても逃げられない。`x-forwarded-for` に自分で書いた値を入れたとき Netlify が本当の発信元を継ぎ足すなら、値が2つになって読めなくなり、後ろの `x-nf-client-connection-ip` に落ちて、けっきょく書いた値が使われる（実際に `getIp` に渡して確かめた）。継ぎ足すのか置き換えるのかも公開資料で確かめられていないので、**書き換えられる側に倒して考える**。

| 送るヘッダ | 既定（いま） | ヘッダを足した場合 |
|---|---|---|
| `x-forwarded-for: 1.2.3.4` | `1.2.3.4` | `1.2.3.4` |
| 上に `x-nf-client-connection-ip: 9.9.9.9` を足す | `1.2.3.4` | **`9.9.9.9`** |
| `x-forwarded-for: 1.2.3.4, 5.6.7.8` | `null` | `null` |
| 上に `x-nf-client-connection-ip: 1.2.3.4` を足す | `null` | `1.2.3.4` |

2行目が決め手。**既定は、クライアントが書いたヘッダでは鍵を動かせない。**そして1行目と3行目のとおり、本番がどちらの状態でも既定は緩まない。**本番のログを見なくても決められるのはこのため。**

仮に全員で1つの枠になっていたとしても、それは緩いのではなく「回り道ができない」という意味で厳しい。利用者は3人なので、共有でも足りる。困る場面も小さい。鍵はパスごとに分かれているので（`createRateLimitKey`）、`/sign-in/email` が埋まっても、ふだん使う Google のログイン（`/sign-in/social`）は別の枠で無事。断ったときは `last_request` を更新しないため待ち時間が延びず、最大10秒で戻る。

棄却した案: `advanced.ipAddress.trustedProxies` に Netlify 側のIPを入れれば、書き換えも共有も避けられる。しかし Netlify はCDNのIPの一覧を公開していない（入れ替わり続けるため）。固定IPは有料プランの機能なので、いまは書けない。

**やり直す条件**: 本番の `rate_limit` テーブルに `no-trusted-ip|` で始まる `key` が実際に出ていて、なおかつ3人が10秒に3回の枠を分け合って困ったとき。

そのときでも、**先に試すのは `rateLimit.customRules` で `/sign-in/email` の回数を増やすこと**。書き換えられる余地が無く、`auth.ts` の設定だけで済む。それでも足りないときに初めて、書き換えられる危険を引き受けてヘッダを足すかを考える。

確かめ方は `server/` で次を実行する（`.env.deploy.local` が要る。→ `docs/guides/deploy.md`）。**本番の管理UIでサインインしてから、すぐに実行すること。**`rate_limit` の行は残り続けない。60秒より古い行は、**あとから来た認証のリクエストのついでに**消される（`better-auth/dist/api/rate-limiter/index.mjs` の `deleteExpiredRows`）ので、間に誰かがサインインしていると**0件が返る。0件は「IPが取れている」ではなく「まだ分からない」**。

```
pnpm exec tsx --env-file=.env.deploy.local -e 'const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query("select key, count, last_request from rate_limit order by last_request desc limit 20")).then(r=>{console.table(r.rows);return c.end()}).catch(e=>{console.error("ERR",e.message);process.exit(1)})'
```

**残る限界**: 数えているのはリクエストの発信元だけで、アカウントごとの試行回数は数えていない。

なお、iOS が叩く公開API（`/api/events`・`/api/stocks`）には回数の制限が1つも無い。iOS を一般公開すると誰でも好きなだけ叩けるため、別に扱う（→ Issue #118）。

### `nextCookies()` を残す理由

サインインが Server Action を離れたため、当初の役割（Server Action が返した `Set-Cookie` を書き移す）は無くなった。それでも残すのは、**Server Component から `getSession` を呼んだときにセッションの期限延長で Cookie を書こうとして書けない状態（DBだけ進む）を防ぐ**ため。`next-js.mjs` の before フックが RSC を判定して期限延長を飛ばす。

配列の**最後**に置く必要がある（`warnIfCookiePluginNotLast` が最後でないと警告を出す）。

## 7. 実装時に踏む穴

先に分かっている4つ。実装時にここへ戻って確認する。

| | 内容 | 対処 |
|---|---|---|
| A | **空欄の `fiscal_month` をそのまま INSERT すると 500 になる。** HTML フォームの空欄は FormData で `""` になり、smallint への INSERT は型変換エラーで落ちる。これは制約違反ではないので §5 の対応表のどれにも当たらず、投げ直して 500 になる。完了条件「US銘柄で空にできること」に直撃する | `app/actions.ts` で `""` → `null` に読み替える |
| B | ~~サインインの失敗表示は §5 とは別系統。`auth.api.signInEmail` はパスワード誤りで例外を投げる~~ | **無効化**。サインインが Server Action を離れたため（→ §6）。いまは応答コードで分ける（下記） |
| C | ~~`redirect("/")` を B の catch の中に入れると、成功したのにエラー表示になる~~ | **無効化**。同上。遷移は `router.push` で行う |
| D | `holding.user_id` は Better Auth の `user` への外部キー。`test/helpers.ts` の `resetDatabase()` は `user` も消すので、保有のテストは先に利用者を作らないと外部キー違反で落ちる | `app/api/events/route.test.ts` の `createUser` と同じく `seedUser` で利用者を作ってから登録する |

B・C は Server Action で書いていたときに実際に踏んだもので、経路を変えた結果あたらなくなった。**記録として残す**（同じ形に戻す判断をするときに再び効くため）。

### サインインの失敗表示（現行）

応答コードで分ける。想定外のコードを「パスワードが違う」と言い切らないため、数字をそのまま見せる（`app/signin/signin-form.tsx` の `messageFor`）。

| 応答コード | 画面に出す文 |
|---|---|
| 401 | メールアドレスまたはパスワードが違います |
| 429 | 試行が多すぎます。しばらく待ってからやり直してください |
| その他 | サインインに失敗しました（応答コード N） |

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

フォームは銘柄・保有・サインインの3つで、サインインだけ挙動が違う（`useActionState` を使わず `fetch` で叩き、成功したら遷移する。→ §6）。**まず銘柄フォームを1つ書き、2つ目で重複が見えてから括り出す。** 最初から「共通の枠」を設計すると、3つしかないフォームの差分を吸収する引数が先に生まれる。

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
4. 誤ったパスワードでサインインし、「メールアドレスまたはパスワードが違います」がフォームの下に出ることを確認する（→ §7「サインインの失敗表示（現行）」）
5. 銘柄フォームで JP・`7203` を登録し、「その市場のティッカーは登録済み」が出ることを確認する（seed が同じ銘柄を入れているため。500 にならないこと）
6. 銘柄フォームで US・`AAPL`・Apple を決算月なしで登録し、銘柄一覧に増えることを確認する（→ §7 A の検証。500 にならないこと）
7. 保有フォームで `AAPL` を選んで登録し、保有一覧に増えることを確認する
8. もう一度 `AAPL` を保有に登録し、「その銘柄はすでに保有に登録済み」が出ることを確認する

確認できたら、結果をこの節に表で追記する（Issue #8 設計書 §7 手順4 と同じ形式）。

### 結果1: HTTP での確認（実施日: 2026-08-09）

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
| 8 | ~~サインインの Server Action に `Next-Action` ヘッダで直接到達~~ | ~~アクションが実行され、認証に失敗したときは「メールアドレスまたはパスワードが違います」を返す。500 にならない~~<br>**この確認は無効になった**。後にサインインを HTTP エンドポイントに移したため（→ §6）。移した後の確認は結果3にある |

### 結果2: 実ブラウザ（実施日: 2026-08-09、Safari のプライベートウィンドウ）

HTTP では確かめられなかった書き込み経路を、運用者が実ブラウザで確認した。**手順1〜8はすべて期待どおりだった。**

登録が本当に DB に届いたことは、確認後に `psql` で突き合わせた。

| 確認したこと | 結果 |
|---|---|
| 手順1〜8（未認証の誘導・サインイン・誤パスワード・重複エラー・US銘柄の登録・保有の登録と重複） | すべて期待どおり |
| `stock` テーブル | `US / AAPL / Apple / fiscal_month は NULL` の行が入った。**§7 A の対処（`""` → `null`）が効いている** |
| `holding` テーブル | AAPL を含む4行。保有の登録が届いている |
| `stock.id` の採番 | seed の3件の次が 10 になった。重複登録の失敗が DB まで届いて弾かれた跡であり、画面のエラー表示が本物の制約違反に由来することを示す |

これにより、登録後に一覧が増えること（`revalidatePath("/")` の効き）もあわせて確認できた。

> **注意: サインインの2手順（手順3・4）は、いま存在しない実装で取った結果である。** この確認のあとサインインを HTTP エンドポイントに移した（→ §6）。新しいフォームでの確認は結果4にある。銘柄・保有の登録に関する手順（5〜8）は経路を変えていないため、この結果はそのまま有効。

### 結果3: 回数制限（実施日: 2026-08-09、HTTP で確認）

サインインを HTTP エンドポイントに移したあと（→ §6）の確認。

| 確認したこと | 結果 |
|---|---|
| 誤ったパスワードで `POST /api/auth/sign-in/email` を5回続ける | `401` `401` `401` **`429`** **`429`**。組み込み規則の「10秒に3回」どおりに止まる |
| `rate_limit` テーブル | `key = <IP>|/sign-in/email`、`count = 3` の行が入る。メモリではなくDBに載っている |
| 11秒待って正しいパスワード | `200`。締め出されたままにならない |

**`enabled: true` にしていなければ、この確認は開発環境では取れなかった**（既定は本番のみ有効）。

### 結果4: 新しいサインインフォーム（実施日: 2026-08-09、Safari のプライベートウィンドウ）

サインインを HTTP エンドポイントに移したあとの実ブラウザ確認。結果2 の手順3・4 を、新しい実装で取り直したもの。

確認前に開発用DBの `session` を全削除してサインアウト状態を作った（`/signin` はサインイン済みだと `/` へ飛ばすため）。

| 確認したこと | 結果 |
|---|---|
| 誤ったパスワードを1〜3回 | 「メールアドレスまたはパスワードが違います」がフォームの下に出る |
| 誤ったパスワードを4回目 | **「試行が多すぎます。しばらく待ってからやり直してください」** に変わる。回数制限が画面まで届いている |
| 窓が開いたあと、正しいパスワード | サインインでき、`/` に移る。`session` テーブルに行が1件できたことを `psql` で突き合わせた |

これで **「入力 → Cookie が付く → `/` に移る」** が新しい経路で成立することを確認できた。結果2 の注意書き（サインインの2手順は旧実装の結果）は、この結果4 で置き換わる。


## 11. やる順番

| 順 | やること | 根拠 |
|---|---|---|
| 1 | Issue #6 の本文を書き換える（theme / theme_stock を外す。→ §2） | 完了条件が変わる。古い完了条件のまま実装すると、作らないと決めたテーマ画面が「未完了」として残り続ける |
| 2 | Tailwind の導入と `biome.json` の変更（→ §8） | 先にやらないと、`.tsx` と `.css` を書くたびに `pnpm lint` が落ち、後の全部が止まる |
| 3 | `layout.tsx` ＋ `/signin` ＋ サインインのフォーム | 認証が無いと `/` の保護（→ §6）が書けず、以降の動作確認がすべてサインインを前提にする |
| 4 | `page.tsx` ＋ `actions.ts` ＋ `src/db/register.ts` | 本体 |
| 5 | `src/db/register.test.ts`（→ §9） | 4 の `register.ts` が対象 |
| 6 | 見た目を整える | 完了条件のどれにも見た目は出てこない（Issue 補足も「画面の見た目に凝らない。利用者=運用者=自分」）。先に整えると 4・5 の手戻りで捨てる |
| 7 | 品質ゲート（`CLAUDE.md` の server の節にあるコマンド全部）が exit 0 | マージ前の唯一のゲート（全体設計書 §11） |

## 12. やらないこと

| 対象 | 理由 |
|---|---|
| theme / theme_stock の登録画面 | Issue #27 に切り出す（→ §2） |
| イベントの登録画面 | Issue #7 |
| 一覧の削除・編集・並べ替え・絞り込み・ページ送り | → §3。イベントの編集・削除だけは Issue #43 で付けた |
| 共通フォーム部品の先行設計 | → §8 |
| `stock.name` の空文字を弾く CHECK 制約の追加 | HTML の `required` で塞ぐ（→ §3）。管理UI以外の書き込み経路は seed だけで、seed は固定値を入れる |
| write 系 API の `openapi.yaml` への追加 | 銘柄・保有の登録は Server Action で完結し、サインインは Better Auth が自前で生やすエンドポイントを使う。どちらも自作のパスではないため契約に載せない。iOS が読む read 系だけを載せる（イベント取得API設計書 §8） |
| サインアウト | 利用者=運用者=自分の1人（全体設計書 §12）。セッションを消したければブラウザの Cookie を消せば足りる |
