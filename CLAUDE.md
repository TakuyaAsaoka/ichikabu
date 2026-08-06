# イチカブ

持ち株に関連するイベント（決算・経済指標・テーマ関連イベント）をカレンダーで見るiOSアプリ。
設計書: `docs/records/specs/2026-08-02-1-ichikabu-design.md`

## リポジトリ構成

```
<repo>/
├── openapi.yaml   ← API契約の唯一の正（手書き）
├── ios/           ← Xcode プロジェクト（Swift + SwiftUI）※ Issue #4 で作成
└── server/        ← Next.js（管理UI + API Route Handlers）
```

pnpm workspace は使わない。pnpm は `server/` の中だけで回す。

## 品質ゲート

GitHub Actions の CI は使わない。**ローカル検証がマージ前の唯一のゲート**（設計書 §11）。

### server（実行ディレクトリ: `server/`）

```
pnpm install && pnpm gen && pnpm build && pnpm test:run && pnpm typecheck && pnpm lint
```

`gen` が `openapi.yaml` から型を再生成するため、`typecheck` が契約整合の検証を兼ねる。

### ios

Issue #4（iOSプロジェクト作成）で追記する。

## 規約

- `openapi.yaml` が API契約の唯一の正。サーバー実装からの自動生成はしない
- `openapi-typescript` の生成物（`server/src/generated/`）は**コミットしない**。品質ゲートで毎回 `pnpm gen` が走るため、コミットしても常に再生成される冗長なファイルになるうえ、契約とのズレを生む余地しかない。iOS側の生成物も同様（設計書 §7）
- コードコメント・テストケース名・コミットメッセージは日本語。ファイル名・ディレクトリ名は英語
