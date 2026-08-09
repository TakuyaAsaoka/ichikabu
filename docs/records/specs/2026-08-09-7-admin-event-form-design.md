# 管理UI（イベント登録）設計書

- 対応 Issue: [#7 管理UI: イベント登録](https://github.com/TakuyaAsaoka/ichikabu/issues/7)
- 根拠: [全体設計書](2026-08-02-1-ichikabu-design.md)（§4 データモデル・§5 イベントの3種別・§10.2 セル表示の規則・§14 未決事項 #10）、[管理UI（銘柄・保有の登録）設計書](2026-08-09-6-admin-ui-design.md)

## 1. 目的と結論

**イベント（`event`）を画面から登録できるようにする。** 現状イベントを入れる手段は `pnpm db:seed`（`src/db/seed-event.ts`）の固定3件だけで、本来の登録手段が無い。

| 項目 | 決定 |
|---|---|
| 未決事項 #10（`short_label` の文字数制約） | **`src/db/register.ts` のバリデーションに留める。DBのCHECK制約は足さない**（→ §3） |
| 対象（市場／テーマ／銘柄）の指定UI | **1つの `<select>` に3グループを平らに並べる**（→ §4） |
| `createEvent` の入力 | 対象3列をそのまま受け取る。0個・2個も渡せる形にし、DBのCHECKに弾かせる（→ §4） |
| 空欄の扱い | `end_date`・`time`・`note`・`source_url` は `""` → `null` に読み替える（→ §5） |
| テスト | `src/db/register.test.ts` に9件追加（→ §7） |
| スコープ外 | テーマ登録画面（Issue #27）、イベントの編集・削除（→ §9） |

管理UI（銘柄・保有の登録）設計書 §5 の方針をそのまま引き継ぐ。**事前に存在確認せず INSERT し、PostgreSQL が返した制約違反を日本語に訳す。**

## 2. ファイル構成と責務

```
server/
├── app/
│   ├── event-form.tsx   ← 新規。"use client"
│   ├── page.tsx         ← 「イベントを登録」と「イベント一覧」を足す
│   └── actions.ts       ← addEvent を足す
└── src/db/
    ├── register.ts      ← createEvent を足す
    └── register.test.ts ← イベントのテストを足す
```

責務は既存と同じ分け方にする（管理UI設計書 §4）。

| ファイル | 責務 |
|---|---|
| `src/db/register.ts` | INSERT、`short_label` の幅の判定（→ §3）、制約違反の日本語化。**Vitest のテスト対象はここだけ** |
| `app/actions.ts` | 認証の確認、FormData の読み取り、対象の値の振り分け（→ §4）、空欄の読み替え（→ §5） |
| `app/event-form.tsx` | 入力欄と `useActionState` |

## 3. 未決事項 #10 の決定: `short_label` は `register.ts` で判定する

**全体設計書 §14 #10「`short_label` の文字数制約の置き場所」を「管理UIのバリデーションに留める」で確定する。DBのCHECK制約は足さない。**

判定は `src/db/register.ts` の `createEvent` の中で行い、超過したら他の制約違反と同じく日本語のエラー文を返す。`app/` ではなく `register.ts` に置くのは、Server Action を経由するすべての登録がここを通り、かつ Vitest から直接テストできるため。

### 数え方

セル規則は「全角4〜5文字まで」（§10.2）で、これは**文字数ではなく表示幅**を指す。既存の `7203決算` は6文字だが、半角4文字＋全角2文字なので全角換算では4文字ぶんになる。

半角を1・全角を2として数え、**合計10（＝全角5文字ぶん）まで**を通す。

```ts
function labelWidth(s: string): number {
  return [...s].reduce((w, c) => w + (/[!-~｡-ﾟ]/.test(c) ? 1 : 2), 0);
}
```

`[!-~]` は ASCII の表示文字、`[｡-ﾟ]` は半角カナ。どちらにも当たらない文字を全角として2で数える。

### DBのCHECK制約にしない理由

| 論点 | 内容 |
|---|---|
| 数字が動く | 「全角4〜5文字」は iPhone 縦のセル幅（約44pt）から出た表示ルール（§10.2）。Issue #9 でフォントや余白を詰めれば動く。CHECK にすると表示ルールを変えるたびにマイグレーションが要る |
| 書き込み経路が2つしかない | 管理UI（本設計）と `seed-event.ts` だけ。`seed-event.ts` は固定値を入れるため、規則を破る余地が無い |
| テストできる点は同じ | `register.ts` に置いても Vitest から実際に呼んで固定できる。CHECK にしないと検証できない、という関係にはない |
| CHECK 式が読みにくい | 全角換算の幅は `char_length(x) + char_length(regexp_replace(x, '[!-~｡-ﾟ]', '', 'g')) <= 10` と1行では書けるが、式から「全角5文字ぶん」という意図が読み取れない |

**引き換えに失うもの**: 管理UI 以外の書き込み経路が増えたとき、その経路は幅の判定を通らない。増やすときに `createEvent` を通すか、そのときCHECKへ移す。

## 4. 対象の指定: 1つの `<select>` に平らに並べる

`event` の対象3列（`market`・`theme_id`・`stock_id`）は「ちょうど1つだけ非NULL」のCHECK制約を持つ（全体設計書 §4.2）。画面ではこれを**1つの `<select>`** で表す。`<select>` は1つしか選べないため、「ちょうど1つ」がHTMLの側で構造的に保証される。

```
対象  [ ── 選んでください ──  ▾ ]
        市場
          JP / US / GLOBAL
        テーマ
          （theme テーブルの行）
        銘柄
          （stock テーブルの行）
```

`<optgroup>` で3グループに分ける。銘柄は数十件、テーマは数件の見込みなので、一覧が長すぎる問題は当面出ない。

種別のラジオボタンと種別ごとの入力欄に分ける案は採らない。選択状態を `useState` で持ち、選ばれていない欄を `disabled` にする制御が要る。その制御を間違えると対象が0個・2個の送信が作れてしまい、HTMLだけで保証できていたものをクライアントのコードで保証し直すことになる。

### 値の受け渡し

`<option value>` を `market:JP` / `theme:12` / `stock:3` の形にし、`app/actions.ts` で分けて3列に振り分ける。

```ts
function toTarget(value: string) {
  const [kind, id] = value.split(":");
  return {
    market: kind === "market" ? id : null,
    themeId: kind === "theme" ? Number(id) : null,
    stockId: kind === "stock" ? Number(id) : null,
  };
}
```

未選択（`""`）は `kind` がどれにも当たらず3列とも `null` になり、DBの `event_target_exclusive_check` が弾く。

### `createEvent` は対象3列をそのまま受け取る

`createEvent` の入力型は対象を3列のまま持ち、**0個や2個の入力も渡せる形にする**。1つに絞った型（`{kind, id}` のユニオン等）にすると、完了条件「対象を1つも選ばない入力・2つ以上選ぶ入力は登録できずエラーになる（500で落ちない）」を Vitest で固定できなくなる。DBのCHECKが本当に効いていることを、型で消さずにテストで残す。

`market` は Drizzle 上 `"JP" | "US" | "GLOBAL"` のユニオン型だが、入力は `string | null` で受ける。`as` で型を偽らず、`createStock` と同じく `sql` で生の値のまま渡し、DBの `event_market_check` に判定させる。

## 5. 空欄の扱い

`end_date`・`time`・`note`・`source_url` は空にできる。HTMLフォームの空欄は FormData で `""` になり、`date`・`time` 列にそのまま INSERT すると**制約違反ではない型変換エラー**で 500 になる。管理UI設計書 §7 A で `fiscal_month` について踏んだ穴と同じもので、今回は4列に増える。

`app/actions.ts` で `""` → `null` に読み替える。

| 欄 | 空のときの値 | 意味 |
|---|---|---|
| `end_date` | `null` | 単日（全体設計書 §4.2「単日は `end_date IS NULL` でのみ表す」） |
| `time` | `null` | 時刻なし |
| `note` | `null` | 補足なし |
| `source_url` | `null` | 出典なし |

`title` と `short_label` は `notNull` で、空文字を弾くCHECKが無い。`stock.name` と同じく HTML の `required` で塞ぐ（管理UI設計書 §3）。

## 6. 登録の失敗の扱い

`src/db/register.ts` の `MESSAGES` に4件足す。制約名は `server/drizzle/0000_simple_blacklash.sql` の実物。

| 制約名 | 画面に出す文 |
|---|---|
| `event_target_exclusive_check` | 対象は市場・テーマ・銘柄のどれか1つを選ぶ |
| `event_period_check` | 終了日は開始日より後にする（単日は空のまま） |
| `event_importance_check` | 重要度は1〜3 |
| `event_market_check` | 市場は JP・US・GLOBAL のどれか |

`short_label` の幅だけは制約違反ではなく `createEvent` 自身の判定（→ §3）だが、戻り値の形は同じ（**成功で `null`、失敗でメッセージ文字列**）にして、`useActionState` の状態にそのまま入る形を崩さない。

外部キー違反（存在しない `theme_id`・`stock_id`）は表に入れない。選択肢は画面がDBから出しているため、通常の操作では起きない。表に無いエラーは投げ直す（管理UI設計書 §5）。

## 7. 画面

`/` の一番下に「イベントを登録」と「イベント一覧」を足す。銘柄・保有と同じく、一覧に削除・編集・並べ替え・絞り込みは付けない（管理UI設計書 §3）。

| 欄 | 入力方法 |
|---|---|
| `title` | `<input type="text" required>` |
| `short_label` | `<input type="text" required maxLength={10}>` |
| 対象 | `<select required>`（→ §4） |
| `start_date` | `<input type="date" required>` |
| `end_date` | `<input type="date">`（空＝単日） |
| `time` | `<input type="time">` |
| `importance` | `<select>` で 1 / 2 / 3 |
| `note` | `<textarea>` |
| `source_url` | `<input type="url">` |

`maxLength={10}` はブラウザ側の目安に過ぎない（半角と全角を区別しないため、全角5文字を超える入力も10文字までは通してしまう）。正しい判定は `register.ts`（→ §3）が持つ。

日付・時刻の入力は `<input type="date">` / `<input type="time">` を使う。ブラウザが持っている入力部品で足り、書式の検証も要らない。

**日付・時刻はすべてJST**（全体設計書 §4.1）。FOMC のように日本時間で翌日未明になるものは、登録者がJSTに直して入れる。画面には注記として出す。

## 8. テスト

`src/db/register.test.ts` に `describe("createEvent")` を足す。テストケース名は日本語。

対象3列のうちどれが埋まるかを固定するため、各テストで登録後の行を読み、選んだ列だけに値が入り**残り2列が `null` である**ことまで確かめる。

| # | テスト | 固定する挙動 |
|---|---|---|
| 1 | 市場イベントを登録するとDBに行が入る | `market` だけ非NULL |
| 2 | テーマイベントを登録するとDBに行が入る | `theme_id` だけ非NULL |
| 3 | 銘柄イベントを登録するとDBに行が入る | `stock_id` だけ非NULL |
| 4 | 対象を1つも選ばないとエラー文が返る | `event_target_exclusive_check` の訳文。500 にならない |
| 5 | 対象を2つ選ぶとエラー文が返る | 同上 |
| 6 | 短縮ラベルが全角5文字を超えるとエラー文が返る | → §3 |
| 7 | 半角と全角が混じった短縮ラベルを登録できる | `7203決算`（6文字・全角換算4文字）が通る。文字数で数えていないことの検証 |
| 8 | 終了日を空にすると単日として登録される | `end_date` が `null` |
| 9 | 終了日が開始日と同じだとエラー文が返る | `event_period_check` の訳文。全体設計書 §4.2「単日は `end_date IS NULL` でのみ表す」 |

2 と 3 はテストの中で `theme` と `stock` を先に作る。`theme` の登録画面は無い（→ §9）が、テストからは `db.insert` で作れる。

## 9. やらないこと

| 対象 | 理由 |
|---|---|
| テーマ登録画面（`theme` / `theme_stock`） | Issue #27。「出典を増やすまでテーマイベントが登録できず動作確認できない」として先送りした判断は、本Issueでも解消しない。対象欄のテーマの選択肢は当面空になる |
| イベントの編集・削除 | 銘柄・保有と揃える（管理UI設計書 §3）。誤登録は `psql` で直す |
| 1回の登録で複数行を作る画面 | **1つの出来事は必ず1行**（全体設計書 §5）。複数の対象に効かせたい出来事はテーマに寄せる |
| 「日付未定」「仮の日付」の入力 | 日単位で確定した日付のみ登録する（全体設計書 §4.1）。`precision` 列は廃止済み |
| `short_label` のCHECK制約 | → §3 |
| `openapi.yaml` への write 系の追加 | 登録は Server Action で完結し、自作のパスではない（管理UI設計書 §12） |

## 10. 目視確認の手順

1. `server/` で `docker compose up -d --wait && pnpm db:migrate && pnpm db:seed` を流し、`pnpm dev` で起動してサインインする
2. 対象欄を開き、市場3件・銘柄3件（seedの分）が `<optgroup>` に分かれて出ることを確認する。テーマは空
3. 銘柄イベントを1件登録し、イベント一覧に増えることを確認する
4. `psql` で `theme` を1件入れ、画面を開き直して対象欄のテーマに出ることを確認する。そのテーマでテーマイベントを1件登録する
5. 市場イベント（GLOBAL）を1件登録する
6. 3〜5 で入れた3件を `psql` で読み、対象3列のうち1つだけに値が入っていることを確認する
7. 短縮ラベルに全角6文字を入れて登録し、「短縮ラベルは全角5文字まで」が出ることを確認する（500 にならないこと）
8. 終了日に開始日と同じ日付を入れて登録し、「終了日は開始日より後にする（単日は空のまま）」が出ることを確認する（500 にならないこと）
9. 終了日・時刻・補足・出典URLをすべて空にして登録し、単日として入ることを確認する（→ §5。500 にならないこと）

確認できたら、結果をこの節に表で追記する。

## 11. やる順番

| 順 | やること | 根拠 |
|---|---|---|
| 1 | 全体設計書 §14 #10 に決定を追記（→ §3） | Issue が「実装前に確定し、設計書へ追記する」と指定している |
| 2 | `src/db/register.ts` の `createEvent` | 本体。ここが唯一のテスト対象 |
| 3 | `src/db/register.test.ts`（→ §8） | 2 が対象 |
| 4 | `app/actions.ts` の `addEvent` ＋ `app/event-form.tsx` ＋ `page.tsx` | 画面 |
| 5 | 目視確認（→ §10） | 画面経由でしか通らない経路（空欄の読み替え・対象の振り分け）を確かめる |
| 6 | 品質ゲート（`CLAUDE.md` の server の節のコマンド全部）が exit 0 | マージ前の唯一のゲート（全体設計書 §11） |
