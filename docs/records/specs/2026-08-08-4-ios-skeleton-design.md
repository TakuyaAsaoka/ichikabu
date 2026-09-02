# iOS 骨組みと品質ゲート（Issue #4）設計

全体設計書 `2026-08-02-1-ichikabu-design.md` の §6・§7・§11 を iOS 側で具体化する。
ここに書くのは、Issue 本文からは導けない「どう作るか」の判断だけ。

## 1. ディレクトリ構成

```
ios/
├── Ichikabu.xcodeproj/
│   ├── project.pbxproj
│   ├── project.xcworkspace/xcshareddata/swiftpm/Package.resolved
│   └── xcshareddata/xcschemes/Ichikabu.xcscheme
├── Ichikabu/                            ← アプリ本体（Xcode の同期フォルダ）
│   ├── IchikabuApp.swift
│   └── ContentView.swift                ← 契約から生成された型を参照する箇所
├── IchikabuAPI/                         ← 契約から型を生成するローカルパッケージ
│   ├── Package.swift
│   └── Sources/IchikabuAPI/
│       ├── openapi.yaml                 ← リポジトリルートの openapi.yaml への symlink
│       ├── openapi-generator-config.yaml
│       └── Contract.swift
└── IchikabuTests/
    └── HealthTests.swift
```

## 2. 判断

### 2.1 プラグインはローカルパッケージに置く

`swift-openapi-generator` のビルドプラグインは、アプリターゲットに直接付けるのではなく、
ローカルの Swift パッケージ `ios/IchikabuAPI/` に付ける。アプリとテストはこのパッケージを使う。

アプリターゲットに直接付ける形も試したが、動かなかった。記録を残す。

| やったこと | 結果 |
|---|---|
| プラグインを `XCSwiftPackageProductDependency`（`productName = "plugin:OpenAPIGenerator"`）としてターゲットの `packageProductDependencies` に入れる | `Missing package product 'OpenAPIGenerator'` |
| `productName` から `plugin:` を外す | 同じエラー |
| `productRef` を持つ `PBXTargetDependency` として繋ぐ | エラーは消えるが生成が走らず、`cannot find 'Components' in scope` |

`project.pbxproj` はテキスト仕様が公開されていないため、この方向は当て推量になる。
ローカルパッケージなら、プラグインの配線は `Package.swift` に普通の Swift として書けて確実に動く。

**引き換え**: SwiftPM は Swift ファイルが1つも無いターゲットをエラーにする
（`target 'IchikabuAPI' referenced in product 'IchikabuAPI' is empty`）。
生成物だけでは通らないので、`Contract.swift` に生成された型への別名を置いてこれを満たす。

### 2.2 `openapi.yaml` は symlink で見せる

プラグインは、対象ターゲットのディレクトリ配下しか `openapi.yaml` を探さない。
一方、契約の唯一の正はリポジトリルートの `openapi.yaml`（全体設計書 §6）。
そこで `ios/IchikabuAPI/Sources/IchikabuAPI/openapi.yaml` をルートへの symlink にする。

- **却下**: コピーを置いて同期スクリプトを回す。契約の実体が2つになり、ズレる余地ができる
- SwiftPM が symlink をたどることは確認した。壊れた symlink は `ignoring broken symlink` と警告して無視されるので、壊れれば気づける

### 2.3 `HTTPTypes` を明示的な依存に足す

生成されたクライアントは `HTTPTypes` の型を直接使う。`swift-openapi-runtime` 経由の
間接依存のままだと、Xcode がパッケージ製品をフレームワークとしてリンクするときに
`Undefined symbol: HTTPTypes.HTTPFields.init()` 等で落ちる。

`.library(type: .static)` にしてもリンクは通るが、アプリとテストの両方がリンクするため
`linked as a static library by 'IchikabuTests' and 'Ichikabu'` で別のエラーになる。
明示的な依存を足すのが素直。

### 2.4 `.xcodeproj` は手書きしてコミットする

XcodeGen・Tuist のような生成ツールは入れない。全体設計書 §7 の「持ち込まないもの」の方針に沿う。
Xcode 16 以降の同期フォルダ（`PBXFileSystemSynchronizedRootGroup`）を使えば、
ファイルを1枚足すたびに `project.pbxproj` を編集する必要がなくなり、手書きでも保守できる。

明示的に入れた設定は次の2つ。どちらも入れないと詰まる。

| 設定 | 理由 |
|---|---|
| `ENABLE_TESTABILITY = YES`（Debug） | 無いと `@testable import Ichikabu` が `unable to resolve module dependency` で落ちる |
| `COPY_PHASE_STRIP = NO`（Debug） | 無いとテスト実行時に `not stripping binary because it is signed` の警告が9件出る |

### 2.5 テストは Swift Testing

Xcode に同梱されており追加の依存が無い。テスト名は日本語（言語ポリシー）。

## 3. 品質ゲート（iOS 側）

```
xcodebuild build test -scheme Ichikabu -destination 'platform=iOS Simulator,name=iPhone 17' -skipPackagePluginValidation
```

ビルド時に契約から型が再生成されるため、このコマンドが契約とのズレの検証を兼ねる（全体設計書 §8）。
`openapi.yaml` の `Event.importance` を `type: string` に変えると
`binary operator '==' cannot be applied to operands of type 'String' and 'Int'` で
落ちることを実際に確認した（2026-09-03 実測。落ちるのは `Ichikabu/EventLayout.swift:83`）。

例に使う型は**アプリが実際に読む経路のもの**にする。`Health.status` で確かめていた時期が
あったが、アプリは `GET /api/health` を叩かず、その型を参照するのがテスト1本だけだった。
そのテストを消したとき（Issue #136）にこの根拠も一緒に消えた。

コマンドが Issue 本文の記載と2点違う。理由は次のとおり。

| 違い | 理由 |
|---|---|
| `-skipPackagePluginValidation` を足した | Xcode はビルドプラグインの初回利用時に画面で信頼を確認するが、`xcodebuild` にはその画面が無く、付けないと `Validate plug-in "OpenAPIGenerator"` で止まる |
| 端末を `iPhone 16` から `iPhone 17` にした | `-destination` に OS を書かないと、インストール済みで最も新しいランタイムから端末を探す。iOS 26.3 には `iPhone 16` が無いため見つからない。`OS=18.6` を書けば `iPhone 16` でも通るが、古いランタイムに固定することになる |

残る警告は Apple のツールが出す
`appintentsmetadataprocessor ... Metadata extraction skipped. No AppIntents.framework dependency found.` の1種類のみ。
App Intents を使っていないアプリでは必ず出るもので、こちら側では消せない。

## 4. 前提（環境）

Xcode の iOS プラットフォームがインストールされていないと、
`xcodebuild -showdestinations` が iOS シミュレータを1件も返さず、品質ゲートが実行できない。
シミュレータのランタイム（iOS 18.6 等）が既にあっても同じで、端末 ID を直接指定しても通らない。

対処は `xcodebuild -downloadPlatform iOS`（Xcode の Settings > Components からでもよい）。
新しい開発機ではここが最初の詰まりどころになるため、`CLAUDE.md` の品質ゲート（ios）の前提として残す。

## 5. この Issue でやらないこと

- サインイン・イベント取得の実装（Issue #5）
- カレンダー UI（Issue #8・#9）
- 生成された `Client` を使った実通信。プラグインの配線確認は型参照だけで足りる
