# iOS サインインとイベント取得 設計書

- 対応 Issue: [#5 iOS: サインインとイベント取得](https://github.com/TakuyaAsaoka/ichikabu/issues/5)
- 根拠: [全体設計書](2026-08-02-1-ichikabu-design.md)（§7 技術選定・§8 API契約・§9 認証・§12 初回リリースに含めないもの）、[イベント取得API設計書](2026-08-08-3-events-api-design.md)、[iOS骨組み設計書](2026-08-08-4-ios-skeleton-design.md)

## 1. 結論

| 項目 | 決定 |
|---|---|
| 認証の入り口 | `POST /api/auth/sign-in/email` を URLSession で直接叩く。`openapi.yaml` には載せない |
| トークンの保管 | 応答ヘッダ `set-auth-token` の値を Keychain に保存する |
| 通信の作り | URLSession + async/await で自分で書く。`openapi.yaml` からは型だけ生成する（`client` 生成をやめる） |
| 画面 | サインイン画面とイベント一覧（`List` に `title` を並べるだけ）。トークンの有無で出し分ける |
| 確認用データ | seed に `GLOBAL` の市場イベントを3件足す。何度実行しても増えない形にする |
| スコープ外 | トークン自動更新・キャッシュ・カレンダー表示・サーバーURL切り替え・書き込み系API（→ §8） |

## 2. 前提として実測した事実

この設計は、開発用サーバーに対して実測した次の6件を前提にしている。

| # | 事実 |
|---|---|
| 1 | `POST /api/auth/sign-in/email` 成功時は 200。本文は `{"redirect":false,"token":"...","user":{...}}`、応答ヘッダに `set-auth-token`（署名付きのトークン）が付く |
| 2 | 本文の `token` と `set-auth-token` の値は、どちらも `Authorization: Bearer` で `GET /api/events` に通る（両方 200 を実測） |
| 3 | 認証なし・でたらめなトークンでの `GET /api/events` は 401 |
| 4 | サインイン失敗は 401 と `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` |
| 5 | swift-openapi-generator が生成する `Event` 型の `startDate` / `endDate` / `time` は `Swift.String`（`Foundation.Date` ではない） |
| 6 | 開発用DBにイベントを入れる仕組みが無い（`server/scripts/seed.ts` は利用者を1件入れるだけ） |

## 3. 判断

| 判断 | 根拠 | 却下した案 |
|---|---|---|
| 1. サインインの経路は `openapi.yaml` に載せない | 全体設計書 §8 の検知（契約を変えたら両側のコンパイルが落ちる）が成り立つのは、自分たちで実装する経路だけ。`app/api/auth/[...all]/route.ts` は Better Auth に丸投げの3行で、生成した型に縛られない。載せても server 側は何も検証されず、「守れない契約」が1本混ざる。iOS 側だけ型が生成される利点も小さい（使うのは成功時の1フィールドと失敗時のメッセージだけで、手書きの構造体と差がない）。§9「Swift に SDK は不要。サインインは POST を叩くだけ」とも一致する | `openapi.yaml` に載せて生成コードで叩く |
| 2. トークンは応答ヘッダ `set-auth-token` から取る | 本文の `token` でも通ることは実測した（事実2）が、`set-auth-token` は Better Auth の Bearer プラグインが Bearer 用に用意している出口。手間は同じ | 本文の `token` を使う |
| 3. 通信は URLSession で自分で書く。`openapi.yaml` からは型だけ生成する | 下の補足を参照 | 生成された `Client` に swift-openapi-urlsession を足して使う |
| 4. 確認用のイベントは seed に足す | 完了条件が「seed イベントのタイトルが並ぶ」。市場イベントのうち `GLOBAL` は保有銘柄が無くても全員に返る（イベント取得API設計書 §5）ため、銘柄・テーマの seed を作らずに3件で足りる。既存の利用者 seed と同じく、何度実行しても増えない形にする | 確認のたびに SQL で手で入れる（毎回やり直しになる）／管理UI（Issue #7）を待つ（完了条件を満たせない） |

### 3.1 判断3の補足

根拠として効くのは次の5つ。

- 判断1によりサインインは必ず自分で書くことになる。イベント取得だけ生成コードにすると、通信の書き方が2種類混ざる
- iOS が叩く経路は当分 `GET /api/events` の1本だけ。登録系は Web管理UI の担当（全体設計書 §2・§12）、カレンダーUI（Issue #8・#9）も同じデータを表示するだけ。1本のために依存1つと認証ヘッダを差し込む仕組み（15行ほど）を足す釣り合いが取れない
- 生成コードを推す理由だった「日付の読み取り規則を任せられる」は、事実5（日付は文字列）により消えた
- 依存が増えないので、ライセンスの確認対象（§7.1）もバージョン追従の対象も増えない
- 全体設計書 §7「iOSネットワーク層は URLSession + async/await のみ」と素直に整合する

**引き換えに失うもの**: URLの綴り（`/api/events`）の間違いがコンパイルで捕まらなくなる。項目名のズレは型を生成し続けるので今までどおり捕まる。401 の分岐の書き忘れも型では防げないため、テストで固定する（→ §6）。

**後戻りは容易**: 経路が増えたら `openapi-generator-config.yaml` に `client` を1行戻せばよい。

**あわせてやること**: `openapi-generator-config.yaml` から `client` を外し、`types` だけにする。iOS骨組み設計書 §2.3 で足した `swift-http-types` の明示依存も外せるか、ビルドで確認する（外せたら外す）。

## 4. 画面と状態の流れ

```
起動 → Keychain にトークンがあるか
        ├ ない → サインイン画面
        │          入力 → POST /api/auth/sign-in/email
        │          成功 → set-auth-token を Keychain に保存 → イベント一覧
        │          失敗 → 画面にメッセージを出す（401 は「メールかパスワードが違います」）
        └ ある → イベント一覧
                   GET /api/events（Authorization: Bearer）
                   200 → List に title を並べる
                   401 → Keychain を消す → サインイン画面に戻る
```

## 5. ファイル構成

```
ios/Ichikabu/
├ IchikabuApp.swift     トークンの有無で画面を出し分ける
├ SignInView.swift      メール・パスワードの入力
├ EventListView.swift   List に title を並べる
├ APIClient.swift       通信（サインインとイベント取得）
└ TokenStore.swift      Keychain の読み書き
```

- `ContentView.swift` は役目を終える（プラグインの配線確認のためだけの画面だった）ので削除する
- 応答の判定（401 なら失敗、200 なら読み取り）は、引数だけで動く小さな関数に切り出す。通信をせずにテストできるようにするため
- Keychain は Security フレームワークをそのまま使う。ラッパーのライブラリは入れない
- サーバーのURLは `http://localhost:3000` の定数1つ。切り替えの仕組みは作らない

## 6. テスト

iOS の品質ゲート（`xcodebuild build test`）で動くもの。テスト名は日本語。

| 固定する内容 |
|---|
| 401 の応答を渡すと認証切れとして扱われる |
| サーバーが実際に返す形の JSON を渡すと `Event` に読み取れる（契約と実物が合っていることの確認） |
| Keychain に保存・読み出し・削除ができる |

## 7. 手で確認すること（Issue の完了条件）

1. サインインすると seed の3件がリストに並ぶ
2. Keychain を空にして起動するとサインイン画面が出る
3. Keychain に壊れたトークンを入れて起動すると、401 でサインイン画面に戻る

## 8. この Issue でやらないこと

| 項目 | 理由 |
|---|---|
| トークンの自動更新 | 全体設計書 §12。401 → サインイン画面で足りる |
| 取得結果の保存・キャッシュ | 全体設計書 §7・§12。データは数KB、毎回取ればよい |
| カレンダー表示・種別ごとの色分け | Issue #8 |
| サーバーURLの切り替え | 定数1つで足りる（→ §5） |
| 書き込み系API | 管理UIの担当（イベント取得API設計書 §8） |

この `List` は使い捨ての足場であり、Issue #8 で月グリッドに置き換わる前提で作り込まない。
