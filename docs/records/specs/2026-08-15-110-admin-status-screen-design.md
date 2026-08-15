# 管理画面に「状態」の画面を作る 設計書

対象 Issue: [#110](https://github.com/TakuyaAsaoka/ichikabu/issues/110)

[入力者を3人にする・監査ログ 設計書](2026-08-14-82-multi-editor-audit-design.md) §7 が「管理画面を目的別に作り直す（別の設計書にする）」と決めた5画面のうち、1枚目の「状態」を作る。

## 1. 目的と結論

登録されているものは一覧に並ぶが、**登録されていないものはどこにも出ない**。抜けを1画面に集めて赤く出す。

| 項目 | 決定 |
|---|---|
| パス | `/status`（`server/app/status/page.tsx`） |
| 判定の置き場所 | `server/src/status.ts` の `findGaps`。画面は呼んで並べるだけ（→ §2） |
| 出すもの | 5種類（→ §3） |
| 画面の入口 | `/` にリンクを1本、`/status` に「一覧に戻る」を1本。共通のナビゲーションは置かない（→ §4） |

## 2. 判定を `src/status.ts` に置く

**画面に書くと検査できない。** `server/` に React Server Component を描画する仕組みが無い。

```
$ grep -rn "@testing-library\|jsdom\|happy-dom" server/package.json server/vitest.config.ts
（0件）
```

Issue #110 の受け入れ条件は「5種類の抜けそれぞれに、抜けがある場合とない場合のテストがある」で、判定が `app/status/page.tsx` にあるとその置き場所が作れない。`src/status.ts` に出せば、`src/db/write.test.ts` と同じく実際の PostgreSQL に対して流せる（`test/helpers.ts` の `resetDatabase`）。

`src/db/` ではなく `src/` 直下にする理由は2つ。

- 5種類のうち「休場日リストの不足」はDBを1行も読まない。`src/rights.ts` の `RIGHTS_YEARS` と今日の日付だけで決まる。DBを見る層に入れる中身ではない
- 「`src/` 直下はDBを触らない層」ではない。`src/auth.ts` が `import { db } from "./db"` を持ち `drizzleAdapter(db, ...)` を呼んでいる

**今日は引数で受け取る**（`findGaps(today)`）。中で時計を読むと、日をまたいだ瞬間に結果が変わる判定をテストから固定できない。日本時間の暦日を作るのは `jstToday`。

## 3. 出す5種類

| 種類 | 判定 |
|---|---|
| 次の決算日が未登録 | その銘柄を対象にした `start_date >= 今日` のイベントが1件も無い銘柄 |
| 決算月なし | `stock.fiscal_month` が NULL の JP 銘柄 |
| 出典の表示名なし | `source_url` はあるが `source_name` が無い行 |
| 過ぎた非アクティブ | `active = false` かつ `coalesce(end_date, start_date) < 今日` の行 |
| 休場日リストの不足 | `RIGHTS_YEARS` の最後の年が「今年＋1」に届いていない |

- イベントに種別の列は無いため、**決算かどうかは判定しない。** 対象が自分の銘柄で日付が未来のイベントを「次の決算日」とみなす
- US銘柄は「決算月なし」に出さない。決算月はJP銘柄にしか入らない（CHECK 制約 `stock_fiscal_month_market_check`）ので、出しても直しようがない
- 直しに行ける画面があるものだけリンクを持つ。「決算月なし」は `/stocks/[id]`、「出典の表示名なし」と「過ぎた非アクティブ」は `/events/[id]`。「次の決算日が未登録」（登録は `/` のフォーム）と「休場日リストの不足」（直すのはソースコード）はリンクを持たない

### 3.1 「過ぎた非アクティブ」は Issue の本文と違う読みを採った

Issue #110 の表は判定材料を「日付が過ぎているのに**アクティブなまま**の行」と書いていたが、採らない。**実測で偽陽性しか出ないことが分かったため。**

```
$ docker exec server-db-1 psql -U postgres -d ichikabu -tAc "select
    count(*) filter (where active and start_date < (now() at time zone 'Asia/Tokyo')::date),
    count(*) filter (where not active and start_date < (now() at time zone 'Asia/Tokyo')::date),
    count(*) from event"
12|0|40
```

- 過ぎたアクティブ12件は、終わったイベントそのものである。`app/api/events/route.ts` の `GET` は `where(eq(event.active, true))` だけで絞り開始日を見ないため、この12件はアプリに正しく出ている。Issue の文言どおり実装すると、全40行の3割が恒久的に赤く並び、しかも増え続ける
- 逆に、非アクティブにするのは「開始日が今日以降」の行だけ（[公表予定の非アクティブ化 設計書](2026-08-12-72-event-active-design.md) §3）なので、**過去に落ちた非アクティブは中止が確定した回**である。同 §4 が「非アクティブの行が要らなくなったら、既にある削除で消せる」と書いているが、その「要らなくなった」を出す場所が今はどこにも無い

監査ログ設計書 §7 の項目名「過ぎた非アクティブ」とも、こちらの読みが一致する。

## 4. 画面の入口

**共通のナビゲーションは `app/layout.tsx` に置かない。** 実測で決めた。

`<nav><a href="/">一覧</a> <a href="/status">状態</a></nav>` を `app/layout.tsx` に入れて開発サーバーを起動し、

```
$ curl -s http://localhost:3000/signin | grep -o '<nav>.*</nav>'
<nav><a href="/">一覧</a> <a href="/status">状態</a></nav>
```

`app/layout.tsx` は `app/signin/page.tsx` も包む（`find app -name "layout.tsx"` はこの1件だけ）ため、**サインインしていない人の画面に管理画面のリンクが並ぶ。**

代わりに、各画面が行き先のリンクを自分で1本持つ形にする。編集4画面（`app/stocks/[id]`・`app/events/[id]`・`app/themes/[id]`・`app/themes/[id]/stocks/[stockId]`）が既に `href="/"` の「一覧に戻る」を持っており、`/status` はその5本目になる。

**#111・#112 で画面が増え、戻る線が増えすぎたら、そのときサインイン済みの画面だけを包む `layout.tsx` をもう1枚足してナビゲーションを置く。** `app/layout.tsx` ではない。今その移動をしても、#112 が画面を割るときにもう一度動かすことになる。

> **その後（#112）: レイアウトは足さず、`app/nav.tsx` の `Nav` を各画面が1行ずつ呼ぶ形にした。** レイアウトは `renderToStaticMarkup(await Page())` では描かれず、監査ログのリンクを入力者に見せない判定を確かめられる場所が無くなるため。→ [管理画面を分ける 設計書](2026-08-16-112-split-admin-screens-design.md) §3

## 5. 棄却した案

| 案 | 棄却の理由 |
|---|---|
| 判定を `app/status/page.tsx` に直に書く | 5種類×2件のテストを置く場所が作れない（→ §2） |
| 判定を `src/db/status.ts` に置く | 「休場日リストの不足」がDBを読まない。DBを見る層が `src/rights.ts` を読む向きになる |
| `app/layout.tsx` に共通のナビゲーションを置く | `/signin` にリンクが出る（実測。→ §4） |
| サインイン済みの画面を `app/(admin)/` へ移してナビゲーションを置く | 今回の受け入れ条件はどれもこの移動を求めない。#112 が同じファイルをもう一度動かす（#112 でも棄却した。→ [管理画面を分ける 設計書](2026-08-16-112-split-admin-screens-design.md) §3） |
| 抜けを種類ごとに折りたたむ・絞り込む | 抜けが無いときは各区画1行で、今の `app/page.tsx`（8区画）より短い。長くなってから足す |

## 6. どこが仮定か

| 記述 | 依存している仮定 | 動いたら |
|---|---|---|
| 銘柄を対象にした未来のイベント＝次の決算日 | 「銘柄イベントとして登録するのは決算がほとんど」 | 決算以外の銘柄イベントが増えて判定が当たらなくなったら、イベントに種別を持たせる |
| 休場日リストは「今年＋1」まであれば足りる | 運用（[全体設計書](2026-08-02-1-ichikabu-design.md) §14）が「毎年2月に翌年ぶんを足す」 | もっと先まで見せるようになったら、必要な年数を増やす |
| 共通のナビゲーションを作らない | 「画面は3枚で、行き来は1本ずつで足りる」 | 動いた。#112 で画面が7枚になり、`app/nav.tsx` の `Nav` を作った（レイアウトではない。→ §4 の注記） |
