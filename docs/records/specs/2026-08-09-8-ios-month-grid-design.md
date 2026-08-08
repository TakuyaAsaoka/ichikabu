# iOS 月グリッドカレンダー 設計書

- 対応 Issue: [#8 iOS: 月グリッドカレンダー](https://github.com/TakuyaAsaoka/ichikabu/issues/8)
- 根拠: [全体設計書](2026-08-02-1-ichikabu-design.md)（§5 表示ルール・§10 メイン画面のUI）、[iOS サインイン設計書](2026-08-08-5-ios-signin-design.md)

## 1. 目的

Issue #5 の素朴な `List` を、全体設計書 §10 の等高の月グリッド（横スワイプで月移動、セルに短縮ラベル2件＋`+N`、種別ごとの色、★3だけ赤線＋太字）に置き換える。

なお Issue #8 補足の「`precision=month` の描き方」は論点として消滅している。全体設計書 §14 #6 で `precision` 列ごと削除され、日単位で確定した日付のみ登録する運用に置き換わったため。

## 2. 判断

| # | 判断 | 根拠 | 却下した案 |
|---|---|---|---|
| 1 | 確認用データは `server/src/db/seed-event.ts` を広げて用意する（→ §3） | 「seed イベントが該当日のセルに表示される」「3件以上の日は2件＋`+N`」「★3だけ赤線＋太字」は、実データが `GET /api/events` を通って届いて初めて確認できる。Preview のダミー配列では通信より手前しか見られない | iOS の Preview にダミー配列を置く（API を通らない）／管理UI（Issue #7）を待つ（未着手） |
| 2 | 期間イベントは期間の各日すべてのセルに出す | §5「月の絞り込みは重なり判定」と同じ考え方で、FOMC 2日目のセルが空になるのを防ぐ。1つの条件式（判断3）で書けて追加コストがない | 開始日だけに出す（2日目が空になる）／週をまたぐ帯の描画（実装が重く、セル2件上限との整合も複雑） |
| 3 | その日に出すかは文字列比較 `startDate <= 日付キー && (endDate ?? startDate) >= 日付キー` で決める | 日付は `"2026-09-16"` 形式のゼロ埋め文字列（openapi-typescript の生成型・swift-openapi-generator の生成型とも `String`）で、辞書順が日付順と一致する。`Date` への変換もタイムゾーンの解釈も発生しない。`end_date = start_date` の行は DB の CHECK 制約 `event_period_check` が拒否することを実測済み（→ §7 手順2）なので、`endDate ?? startDate` の縮退で単日と期間を同じ式で扱える | `Date` にパースして比較（DateFormatter とタイムゾーン指定が増えるだけで同じ結果）／期間を日の配列に展開（展開処理が丸ごと不要） |
| 4 | カレンダーの日付計算は JST 固定（グレゴリオ暦・日曜始まり・`Asia/Tokyo`）。日付キーの生成は `en_US_POSIX` ロケールを固定した `DateFormatter` で行う | イベントの日付は契約上 JST（`openapi.yaml` の `time` の説明）。端末のタイムゾーン・和暦設定でセルの日付がずれてはならない。ロケールを固定しないと端末の暦設定（和暦等）で `yyyy` が別の年号になる | `Calendar.current` を使う（端末設定に依存する） |
| 5 | 月の移動は `TabView(.page)`＋起動月の前後12ヶ月の固定25ページ。`selection` は月オフセット（`-12...12` の `Int`） | §10.1 の指定どおり。固定範囲なら `ForEach(-12...12)` に流すだけで、端に達したら止まるという挙動も自然に手に入る。`.page` スタイルはページを遅延生成しないが、25ページ×42セルの静的ビューは軽く、実害がない | 無限スワイプ（ページの付け替えロジックが必要）／イベントのある月だけ（空の月に移動できず不自然） |
| 6 | 6週固定（42セル）で描く | どの月も同じ行数になり、§10「等高」が構造で保証される。行数を月ごとに変える案は「等高」を別の手段（固定セル高）で作り直すことになり、ページ下端の余白も月ごとに変わる | 月の実週数（4〜6週）で描く |
| 7 | ファイルは2つ。`EventListView.swift` を `CalendarView.swift` にリネームして画面を差し替え、日付計算とフィルタは `EventLayout.swift` に純関数で置く | イベント取得・401処理・トークン連携は今のまま使える。純関数を分けるのはテスト（→ §5）のため。Xcode プロジェクトは `PBXFileSystemSynchronizedRootGroup` なのでリネーム・追加に pbxproj の編集は不要 | 1ファイルに全部書く（日付計算がビューに埋まりテストできない）／セル・週・月をファイル分割（1画面に4ファイルは過剰） |
| 8 | 種別の色は3色とも `Color(red:green:blue:)` で明示定義する | 琥珀・藍は SwiftUI 標準に無い。紫だけ `.purple` を使うと、3色の彩度・明度が揃わず並んだときに1系統に見えない。ダークモード専用の色は作らない（全体設計書はダークモード対応を明示しておらず、対応を謳うならセル背景・赤線含め全体の設計が要る。ここで色だけ対応しても中途半端になる） | `.purple` だけ標準を使う／ライト・ダーク2値の定義 |
| 9 | 月外の日（42セルの前後の埋め草）は日番号をグレーで出し、イベントは出さない | 日番号があると曜日の並びが読める。イベントまで出すと前月末のイベントが2ページに現れ、月サマリ（Issue #9）の件数と食い違って見える | 空セルにする（曜日の並びが読めない）／イベントも出す |
| 10 | グリッド上部に月タイトル（`2026年9月`）を出し、今日の日番号に丸背景を付ける | 月タイトルが無いと今どの月かが分からず、完了条件「横スワイプで前月・翌月に移動できる」の確認もできない。今日の強調は「イベントまであと何日か」を読む起点で、比較1つで済む | タイトルなし（月が識別できない）／今日の強調なし |
| 11 | 確認用データも出典ポリシー（全体設計書 §5.1）に従う。日付は各社IRページで確認した実在のものだけを使う（→ §3） | 出典ポリシーは本番データだけの話ではない。作った日付を seed に置くと、後から「この日付は何だったのか」を誰も判定できなくなる。実在の日付なら `source_url` に出典を残せ、Issue #7 のイベント登録の動作確認にもそのまま使える。この判断の結果、seed に入るのは銘柄イベントだけになり、種別ごとの色と期間イベントの目視確認が落ちる（テストに移す → §5） | それらしい日付を作る（初案は9/16にトヨタの決算を置いていたが、決算月が3月のトヨタに9月の決算は無い）／seed だけポリシーの対象外にする（利用者に配信しないデータだからという理屈は立つが、seed は Issue #7 の動作確認にも使うので、確認用と本番用の境目が曖昧になる） |

## 3. 確認用データ（server）

イベントを届けるには保有が要る（`GET /api/events` は保有起点で絞る）ため、最小のマスタごと seed に足す。

**出典は各社のIRページだけを使う**（全体設計書 §5.1。Issue #24 で確定）。よって seed に入れられるのは**銘柄イベント（決算発表日）だけ**になる。決算発表日は発表の約1か月前にしか確定しないため（全体設計書 §14 #6 の根拠）、今日（2026-08-09）の時点で確定しているのは8月上旬までの分である。確認用の山は**起動月である8月**に置くことになり、副産物として目視確認がスワイプ無しで行える。

### 既存 seed から落とすもの

| 落とすもの | 理由 |
|---|---|
| FOMC（9/16〜9/17）・米CPI（9/11）・米雇用統計（10/2） | 出典が FRB と BLS で、どちらも §5.1 で「今は使わない」に入った |

`seed-event.ts` の `EVENTS` は総入れ替えになる。既存の3件は `title` で存在を判定しているだけなので、配列から消せば新規投入の対象から外れる。**既にDBに入っている3件は消えない**ため、確認前に `docker compose down -v` でDBを作り直すか、手で消す（→ §7 手順4）。

### 追加するもの

| テーブル | 追加する行 |
|---|---|
| `stock` | JP `7203` トヨタ自動車（`fiscalMonth: 3`）／JP `6367` ダイキン工業（3）／JP `9434` ソフトバンク（3） |
| `holding` | seed ユーザー × 上の3銘柄 |
| `event` | → 下表 |

`theme` と `theme_stock` は入れない。テーマイベントを登録できない以上、テーマを作っても表示に何も起きないため。

| 日付 | 種別 | `short_label` | ★ | 出来事と出典（`source_url` に入れる） |
|---|---|---|---|---|
| 2026-08-04 | 銘柄 7203 | `7203決算` | 3 | トヨタ自動車 2027年3月期 第1四半期決算（[global.toyota](https://global.toyota/jp/ir/financial-results/index.html)） |
| 2026-08-04 | 銘柄 9434 | `9434決算` | 2 | ソフトバンク 2027年3月期 第1四半期決算（[softbank.jp](https://www.softbank.jp/corp/news/press/sbkk/2026/20260804_01/)） |
| 2026-08-04 | 銘柄 6367 | `6367決算` | 1 | ダイキン工業 2027年3月期 第1四半期決算（[daikin.co.jp](https://www.daikin.co.jp/investor/calendar)） |

★（`importance`）は運用者の主観の設定値なので、出典で確認する対象ではない。3件を★3・★2・★1に散らして、セル上の差が「★3かそれ以外か」の2値になることを確認できるようにする。

時刻は入れない（各社の開示時刻を一次情報で確認していないため。`time` は空にできる）。結果、8/4 の3件は API の並び（`startDate, time, id` 昇順。`time` の NULL は最後 → §7 手順2）で `id` 順、すなわち上表の順に並ぶ。

### 目視で確認できること・できないこと

| | 確認手段 |
|---|---|
| 短縮ラベルが該当日のセルに出る | **目視**（8/4） |
| 1日3件で「2件＋`+1`」になる | **目視**（8/4） |
| ★3だけ赤線＋太字、★1と★2に差がない | **目視**（8/4） |
| 横スワイプで前月・翌月に移動する | **目視** |
| 種別ごとに色が違う（琥珀／藍／紫） | **テスト**。琥珀しか seed に入らないため → §5 |
| 期間イベントが各日に出る | **テスト**。決算はすべて単日のため → §5 |

下2つは Issue #8 の完了条件から目視を外し、テストで固定する形に書き換える（Issue 本文も同じPRで直す）。市場イベントとテーマイベントを seed に入れられるようになるのは、出典を増やしたときである。

実装の要点:

- `seedUser` の戻り値に `userId` を足す（既に両分岐で user オブジェクトを持っており1行）。`scripts/seed.ts` がそれを `seedEvents(userId)` に渡す。seedEvents 内でメールから引き直す案は、結局メールを引数で渡すうえ問い合わせが1回増えるだけなので採らない
- 何度実行しても増えないこと: `stock`（UNIQUE market×ticker）と `holding`（複合PK）は `onConflictDoNothing`、`event` は既存の title 判定をそのまま使う

## 4. iOS の構成

| ファイル | 役割 |
|---|---|
| `CalendarView.swift`（`EventListView.swift` をリネーム。`IchikabuApp.swift` の参照も追随） | イベント取得・401処理・エラーメッセージは現行のまま。`List` を `TabView(.page)`（インジケータ非表示）に差し替え、月タイトル＋曜日ヘッダ＋6週×7列のグリッドを描く |
| `EventLayout.swift` | 純関数のみ。月オフセット→42日の配列（週ごとに7日×6）、`Date`→日付キー文字列、日付キー→その日のイベント（判断3の条件でフィルタ。API の並び順を保つ）、`kind`→色 |
| `IchikabuTests/EventLayoutTests.swift` | → §5 |

セル表示の規則（§10.2）の実装:

| 規則 | 実装 |
|---|---|
| 短縮ラベル2件まで、3件目以降は `+N` | `prefix(2)` ＋ 残数の `Text("+\(n)")` |
| 色は種別だけ | `EventLayout` の `kind`→色（銘柄＝琥珀／市場＝藍／テーマ＝紫）をラベル文字色に使う。3色の対応付けを純関数に置くのは、seed に銘柄イベントしか入らず目視で確認できないぶんをテストで固定するため（→ §3・§5） |
| ★3は赤線＋太字 | `importance == 3` のときだけ `HStack` 左端に幅2ptの赤い `Rectangle`、`.bold()` |
| ラベルの収まり | `.lineLimit(1)`（セル幅で尻切れ。正式名称は Issue #9 のシートで出す） |
| 等高 | 6行固定＋各行 `.frame(maxHeight: .infinity)` で縦を等分 |
| アクセシビリティ | セルを `.accessibilityElement(children: .combine)` で1要素にし、日付とイベント名を続けて読み上げる |

`TabView` の落とし穴として、`selection` の型とページの `.tag()` の型が一致しないと選択が効かない。`@State` の月オフセット（`Int`、初期値0＝起動月）と `.tag(offset)` を同じ `Int` で揃える。

## 5. テストで固定すること

`EventLayoutTests.swift`（純関数のみ対象。`xcodebuild build test` のゲートに乗る）。

**下2つは目視の代わりである。** seed に入るのは銘柄イベント（単日）だけなので、種別ごとの色と期間イベントの各日表示はシミュレータで確かめられない（→ §3）。

| テスト | 固定する挙動 |
|---|---|
| 種別ごとに違う色になる | `market`・`theme`・`stock` の3つが互いに異なる色を返す |
| 単日イベントはその日だけに出る | 前日・翌日のキーで空 |
| 期間イベントは開始日から終了日までの各日に出る | 9/16・9/17 に出て 9/15・9/18 に出ない |
| 月をまたぐ期間が両方の月に出る | 8/31〜9/1 が8月末のセルにも9月頭のセルにも出る |
| 週配列は常に42日で、月初の曜日位置が正しい | 2026年9月は1日が火曜（日曜始まりで3列目） |
| 日付キーが端末のタイムゾーンに依存しない | JST 深夜 0:30 の時刻（UTC では前日 15:30）のキーが JST の日付になる |

## 6. やらないこと（Issue #9 との境界ほか）

| 対象 | 理由 |
|---|---|
| セルタップのボトムシート・正式名称・★の実数表示・月サマリ（`n件・★3がm件`） | Issue #9 |
| `+N` のタップ反応 | Issue #9 のシートが受け持つ |
| 無限スワイプ・13ヶ月以上先の表示 | 前後12ヶ月固定（判断5） |
| ダークモード専用の配色 | 判断8 |
| イベントのキャッシュ・再取得UI | Issue #5 設計書 §8 のスコープ外を踏襲 |

## 7. 確認手順

### 手順1: seed が何度実行しても増えない（実測済み）

実装前の基準値（既に3件入った状態での再実行）:

```
$ cd server && pnpm db:seed
ユーザーは既に存在する: dev@example.com
イベントを 0 件作成した
```

実装後、DBを作り直したうえで再実測した（実測済み（2026-08-09））:

```
$ cd server && docker compose down -v && docker compose up -d --wait && pnpm db:migrate && pnpm db:seed && pnpm db:seed
...
> ichikabu-server@ db:seed /server
> tsx --env-file=.env.local scripts/seed.ts

ユーザーを作成した: dev@example.com
イベントを 3 件作成した

> ichikabu-server@ db:seed /server
> tsx --env-file=.env.local scripts/seed.ts

ユーザーは既に存在する: dev@example.com
イベントを 0 件作成した
```

初回が `3 件`、2回目が `0 件` になり、冪等性を確認した。

### 手順2: 設計の前提の実測（実測済み）

`end_date = start_date` は CHECK 制約が拒否する（判断3の前提）:

```
$ docker exec server-db-1 psql -U postgres -d ichikabu -c \
  "INSERT INTO event (title, short_label, start_date, end_date, importance, market)
   VALUES ('検証用', '検証', '2026-09-16', '2026-09-16', 1, 'GLOBAL');"
ERROR:  new row for relation "event" violates check constraint "event_period_check"
```

`time` の NULL は昇順で最後に並ぶ（8/4 の3件が `id` 順に並ぶ根拠）:

```
$ docker exec server-db-1 psql -U postgres -d ichikabu -c \
  "SELECT x FROM (VALUES ('03:00'::time), (NULL), ('15:00'::time)) AS t(x) ORDER BY x;"
 03:00:00
 15:00:00
 (null)
```

### 手順3: 品質ゲート（CLAUDE.md の2系統。実測済み（2026-08-09））

server 側:

```
$ cd server && pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint
...
✨ openapi-typescript 7.13.0
🚀 ../openapi.yaml → src/generated/api.d.ts [26.3ms]
...
✓ Compiled successfully in 472ms
  Running TypeScript ...
  Finished TypeScript in 2.0s ...
...
 Test Files  4 passed (4)
      Tests  42 passed (42)
...
> tsc --noEmit
（出力なし＝エラー0件）
...
> biome check
Checked 24 files in 48ms. No fixes applied.
```

エラー・警告とも0件。

iOS 側:

```
$ cd ios && xcodebuild build test -scheme Ichikabu \
    -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
...
Test run with 15 tests in 4 suites passed after 0.049 seconds.
...
** TEST SUCCEEDED **
```

ビルド・テストとも成功、Swiftコンパイラの警告は0件。ログに `warning:` が3件出るが、いずれも `appintentsmetadataprocessor`（Xcode 16以降がアプリターゲットに自動で付けるビルドフェーズ）が出す定型メッセージ `Metadata extraction skipped. No AppIntents.framework dependency found.` で、このアプリがApp Intentsフレームワークを使っていないターゲットでは必ず出る仕様（Apple公式フォーラム・開発者コミュニティで確認済み）。コード側の警告ではなく、使っていないフレームワークを追加でリンクする以外に消す方法が無いため、コードは変更していない。

### 手順4: シミュレータでの目視（未実施。実装後に行う）

1. `docker compose down -v && docker compose up -d --wait` でDBを作り直し、`pnpm db:migrate && pnpm db:seed` を流す（既にDBに入っている FOMC・米CPI・米雇用統計を消すため。→ §3）
2. `pnpm dev` でサーバーを起動し、シミュレータでサインインする
3. 起動月（8月）のページで、8/4 のセルに `7203決算`（赤線＋太字）＋ `9434決算`（線なし）＋ `+1` が出ることを確認する
4. 8/4 以外の日にイベントが出ていないこと、今日（8/9）の日番号に丸背景が付いていることを確認する
5. 左右のスワイプで前月・翌月に移動でき、2025年8月〜2027年8月の端で止まることを確認する
