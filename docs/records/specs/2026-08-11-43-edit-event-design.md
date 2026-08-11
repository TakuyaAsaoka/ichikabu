# イベントの編集・削除 設計書

- 対応 Issue: [#43 登録済みイベントの出典を管理UIから直せるようにする](https://github.com/TakuyaAsaoka/ichikabu/issues/43)
- 根拠: [全体設計書](2026-08-02-1-ichikabu-design.md)（§4.2 列の判断）、[管理UI設計書](2026-08-09-6-admin-ui-design.md)（§3 画面構成・§5 登録の失敗の扱い）、[出典表示設計書](2026-08-11-41-event-source-design.md)（§3.1 出典の持ち方・§8 やらないこと）

## 1. 目的と結論

**登録済みのイベントを画面から直せるようにする。** Issue #41 で出典の記載を条件とする出典（日本の府省、公共データ利用規約）を使い始めたため、出典の表示名が入っていない行は規約の条件を満たさない行になった。管理UIは登録しかできず、それを直す手段が `psql` しか無い。

| 項目 | 決定 |
|---|---|
| 直せる範囲 | イベントの全列。出典の2列だけに絞らない（→ §2） |
| 編集の場所 | 別ページ `/events/[id]`。一覧の各行に「編集」リンクを置く（→ §3） |
| 削除 | 編集ページに置く。確認を挟む（→ §3.2） |
| 一覧の出典 | 出す。出典表示設計書 §8 の「やらない」を取り消す（→ §3.1） |
| フォームの共通化 | `app/form.tsx` に骨格を括り出し、5つのフォーム全部で使う（→ §4） |
| 登録フォームの再利用 | `EventForm` に初期値と Server Action を渡し、登録と編集の両方で使う（→ §4.2） |
| 他のテーブル | 今回はやらない。別Issueに起こす（→ §9） |

## 2. スコープ: イベントだけにする

Issue #43 の「残る判断」1・4 の決着。

管理UIが持つ5つのテーブルで「直す」の中身は同じではない。

| テーブル | 主キー以外の列 | 「直す」の中身 | 今回 |
|---|---|---|---|
| `event` | 名称・短縮ラベル・日付・時刻・重要度・補足・出典2列・対象3列 | 編集と削除 | **やる** |
| `stock` | 市場・ティッカー・銘柄名・決算月 | 編集と削除 | やらない |
| `theme` | テーマ名 | 編集と削除 | やらない |
| `holding` | 無い（`user_id` + `stock_id` が主キー） | 削除だけ | やらない |
| `theme_stock` | 無い（`theme_id` + `stock_id` が主キー） | 削除だけ | やらない |

保有とテーマ所属は「どの銘柄を持っているか」「どの銘柄をどのテーマに入れたか」そのものが主キーで、直す列が無い。間違えたら消して入れ直す形になる。

**急ぐ理由があるのはイベントだけ。** 規約の条件がかかるのは `event.source_name` だけで、他の4つは運用者の記録が欠けるだけに留まる。ただし §4 の共通部品は5つのフォーム全部に入れるため、残り4テーブルを足すときの手間は今回のうちに減らしておく。

出典の2列だけに絞る案は採らない。名称・日付の打ち間違いを直す手段が `psql` のまま残り、同じ Issue をもう一度立てることになる。フォームは §4.2 のとおり登録と共用するため、全列を編集できるようにしても増える手間はほとんど無い。

## 3. 画面構成

管理UI設計書 §3 の「一覧に削除・編集は付けない」を、イベントについてだけ取り消す。

| パス | 中身 |
|---|---|
| `/` | 今のまま（登録フォームと一覧）。イベント一覧の各行に出典の表示名と「編集」リンクを足す |
| `/events/[id]` | イベントの編集フォームと削除ボタン |

並べ替え・絞り込み・ページ送りは引き続き付けない。

### 3.1 一覧に出典を出す

Issue #43 の「残る判断」3 の決着。出典表示設計書 §8 は「一覧は登録できたかの確認に使うもので、出典は確認に要らない」として一覧に出典を出さないと決めた。**この理由は Issue #41 で成り立たなくなった。** 出典の表示名を入れ忘れた行は規約の条件を満たさない行なので、入っているかどうかの確認そのものが必要になった。

```
2026-09-01 ★2 日銀  / JP / 日銀金融政策決定会合  出典: 内閣府（PDL1.0）  編集
2026-09-05 ★1 CPI   / US / 米消費者物価指数      出典: 表示名なし        編集
```

**「表示名なし」は淡色（`text-muted`）で出し、赤字にしない。** URLだけを入れて表示名を空にするのは設計上正しい形（出典表示設計書 §3.1「逆（URLだけ）は許す」）で、誤りではないため。

### 3.2 削除

Issue #43 の「残る判断」2 の決着。削除は編集ページに置く。一覧に並べると誤って押しやすい。

`event` は他のテーブルから参照されないため、消しても外部キー違反は起きない。一方で消したイベントは戻せないので、送信前に確認を挟む（→ §4.1）。

## 4. 共通部品

### 4.1 `app/form.tsx`

5つのフォーム（銘柄・保有・テーマ・テーマ所属・イベント）が同じ骨格を持っている。

```
useActionState(action, null)
  → <form action={formAction} className="flex flex-col gap-3">
      入力欄
      <button disabled={pending}>{pending ? "送信中" : ラベル}</button>
      <p className="text-error empty:hidden" aria-live="polite">{error}</p>
```

これを3つに括る。

| 名前 | 中身 |
|---|---|
| `field` | 入力欄の `className`（`rounded border border-border p-2`）。今は `event-form.tsx` の中にだけある |
| `fieldLabel` | ラベルと入力欄を包む `<label>` の `className`（`flex flex-col gap-1`） |
| `ActionForm` | 上の骨格全部。`action`・`submitLabel`・`confirm`・`children` を受け取る |

**ラベルはコンポーネントに包まず、`className` だけを括る。** 入力欄を `children` で受け取る `Field` コンポーネントにすると、`<label>` の中に入力欄があることを biome が追えず `noLabelWithoutControl` に引っかかる。`<label>` で入力欄を包む形自体は正しいので、抑制コメントで黙らせるのではなく、入れ子を各フォームに書いたまま残す。

`ActionForm` の `confirm` は削除のためにある。文字列を渡すと、送信ボタンを押したときにブラウザの確認ダイアログが出る。

```tsx
onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
```

`<form onSubmit>` ではなく送信ボタンの `onClick` に置く。送信ボタンの click を止めれば送信自体が始まらないという、React を挟まないブラウザの動きだけで済む。

**`useActionState` が `ActionForm` に移るため、5つのフォームから `"use client"` が消える。** どれも初期値を出すだけの素のコンポーネントになる。Server Component から Client Component へ `children` を渡す形になり、これは通常の使い方。

### 4.2 `EventForm` を登録と編集で使う

```tsx
<EventForm themes={themes} stocks={stocks} action={addEvent}  submitLabel="イベントを登録" />
<EventForm themes={themes} stocks={stocks} action={editEvent} submitLabel="イベントを更新" event={row} />
```

`event` を渡したときだけ、各入力欄に `defaultValue` が入り、`<input type="hidden" name="id">` が付く。

対象の `<select>` の初期選択は、`market` / `themeId` / `stockId` のうち埋まっている列から `"market:JP"` の形を組み立てる。振り分けの逆向きで、`app/event-input.ts` の `toTarget` と対になる。

送信するフィールドの名前は登録と編集で同じなので、`toEventInput` はそのまま両方で使える。

## 5. サーバー側

### 5.1 `src/db/register.ts` を `src/db/write.ts` に変える

登録以外も持つことになり、`register`（登録）という名前が中身と合わなくなる。テストの `register.test.ts` も `write.test.ts` に変える。

### 5.2 足す関数

```ts
/** イベントを更新する。成功で null、失敗で日本語のエラー文を返す */
export function updateEvent(id: number, input: EventInput): Promise<string | null>

/** イベントを削除する。成功で null */
export function deleteEvent(id: number): Promise<string | null>
```

`updateEvent` は `createEvent` と同じく短縮ラベルの幅を判定してから `run()` を通す。これで制約違反の日本語化（`event_source_name_check` を含む）がそのまま効く。`MESSAGES` に足すものは無い。

`market` は `createEvent` と同じく Drizzle の `sql` テンプレートで生の値のまま渡し、`event_market_check` に判定させる。`as` で型を偽らない。

### 5.3 `app/actions.ts`

`editEvent` と `removeEvent` を足す。どちらも `requireUserId()` を通す。名前が `updateEvent` / `deleteEvent` と違うのは、同じファイルで DB 側の関数を読んでいて名前がぶつかるため。登録側も `addEvent`（Server Action）と `createEvent`（DB）で同じ分け方をしている。

| 操作 | 入力 | 成功したとき |
|---|---|---|
| 更新 | `Number(formData.get("id"))` と `toEventInput(formData)` | `revalidatePath("/")` → `redirect("/")` |
| 削除 | `Number(formData.get("id"))` | `revalidatePath("/")` → `redirect("/")` |

**どちらも一覧に戻す。** 編集ページに留まらせると「更新した」を出すための状態を別に持つことになる。一覧に戻れば、直した結果がその場で見える。

`redirect()` は例外を投げて動くため、`revalidatePath()` を先に呼ぶ。

## 6. 実装時に踏む穴

| 穴 | 対処 |
|---|---|
| `time` 列は `"14:00:00"` の形で返るが、`<input type="time">` は秒を扱わない | 初期値に渡すときに先頭5文字（`HH:MM`）だけ取る |
| `/events/[id]` の `params` は Promise | `const { id } = await params`（Next.js 同梱ドキュメント `01-app/03-api-reference/03-file-conventions/dynamic-routes.md`） |
| 存在しないIDのURLを直接開かれる | `notFound()` を呼ぶ |
| `id` に問い合わせに渡せない値が来る | 下の表のとおり **500 になる**。`src/db/write.ts` の `isEventId`（整数かつ 1〜2147483647）を1つ持ち、編集ページと `updateEvent` / `deleteEvent` の両方から呼ぶ。ページは `notFound()`、更新・削除は日本語のエラー文を返す。Server Action は画面を通さず直接POSTできるため、画面側の判定とは別に要る |
| 更新でも `""` を date・time 列に入れると型変換エラーで500になる | `toEventInput` が既に空欄を `null` に読み替えている。登録と同じ経路を通す |

実際にURLを開いて測った結果。**整数かどうかだけを見ると2行目が残る**ため、範囲も見る `isEventId` にした。`—` は測っていない組み合わせ。

| URL | 判定なし | `Number.isInteger` だけ | `isEventId`（今） |
|---|---|---|---|
| `/events/abc` | 500（`invalid input syntax for type integer`） | 404 | 404 |
| `/events/9999999999` | — | 500（`out of range for type integer`） | 404 |
| `/events/1.5` | — | 404 | 404 |
| `/events/999999` | 404 | 404 | 404 |

`id` を入れずに Server Action を直接POSTすると `Number(null)` が `0` になる。`isEventId` の下限を 1 にしてあるため、これも同じ経路で弾かれる。

## 7. テスト

`src/db/write.test.ts`（改名前は `register.test.ts`）に足す。

| テスト | 確かめること |
|---|---|
| 更新でイベントの列が変わる | `updateEvent` が全列を書き換える |
| 出典の表示名だけを入れた更新は日本語のエラー文を返す | 更新でも `event_source_name_check` が効く（Issue の受け入れ条件3） |
| 短縮ラベルが長すぎる更新は日本語のエラー文を返す | 更新でも幅の判定が効く |
| 削除でイベントが消える | `deleteEvent` |
| 存在しないIDの更新・削除は何も起きない | 0件更新で例外にならない |
| 数字でないIDの更新・削除はエラー文が返る | `NaN` を integer 列に渡さない（→ §6） |
| integer の範囲を超えるIDの更新・削除はエラー文が返る | 桁数の多い数を integer 列に渡さない（→ §6） |
| `id` が無いまま送られた削除はエラー文が返る | `Number(null)` の `0` を弾く（→ §6） |

`app/event-input.test.ts` は変えない。`toEventInput` は登録と編集で同じものを使う。

## 8. 目視確認の手順

1. `pnpm dev` で起動し、サインインする
2. 出典URLだけを入れ、表示名を空にしたイベントを登録する
3. 一覧にその行が「出典: 表示名なし」で出ることを見る
4. その行の「編集」を押し、`/events/[id]` に各列の値が入っていることを見る
5. 表示名だけを入れて出典URLを空にして更新し、「出典の名前を入れるならURLも入れる」が画面に出ることを見る
6. 表示名とURLの両方を入れて更新し、一覧に戻って表示名が出ることを見る
7. 編集ページの削除を押し、確認ダイアログが出ることと、OKで一覧からその行が消えることを見る

## 9. やらないこと

| やらないこと | 理由 |
|---|---|
| 銘柄・テーマの編集と削除 | 別Issueに起こす。規約の条件がかからないため急がない。削除は外部キーで弾かれる場合がある（銘柄は保有・イベントから、テーマはイベントから `restrict` で参照される）ので、そのIssueで日本語のエラー文を足す |
| 保有・テーマ所属の削除 | 同じく別Issue。この2つは主キー以外の列が無く「削除だけ」になる（→ §2） |
| 一覧の並べ替え・絞り込み・ページ送り | 管理UI設計書 §3 のまま。件数が少ない |
| `event.id` 以外の数値入力の同じ穴を塞ぐ | `event.theme_id` / `event.stock_id` や他テーブルにも、問い合わせに渡せない値で 500 になる同じ穴がある。これは Issue #43 より前からあり、`addEvent` も同じ経路を通っていた。今回は `event.id` だけを塞ぎ、残りは [Issue #46](https://github.com/TakuyaAsaoka/ichikabu/issues/46) に起こした |
| 更新の履歴を残す | 利用者=運用者=自分の1人（全体設計書 §12）。誰がいつ直したかを追う相手がいない |
| 更新・削除の `openapi.yaml` への追加 | Server Action で完結し、自作のパスではない（管理UI設計書 §12 と同じ理由） |
