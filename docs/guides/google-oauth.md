# 管理UIの Google でのログイン

管理UI（`https://ichikabu.netlify.app` と `http://localhost:3000`）に Google アカウントでログインするための設定手順。

iOS アプリはこの経路を使わない。iOS は今までどおりメールアドレスとパスワードで
`POST /api/auth/sign-in/email` を叩く（設計書 §9）。

## 入れる人は1人だけ

**このアプリの利用者は1人で、新しい利用者を作る経路は無い**（設計書 §9）。
Google でログインできるのは、`pnpm db:seed` で入れた利用者と**同じメールアドレス**の
Google アカウントだけ。他のアカウントは、DBに利用者が居ないので拒まれる。

許可するメールアドレスの一覧は持たない。DBの利用者がそのまま「入れてよい人」になる。

## 1. Google Cloud Console でクライアントIDを作る

1. https://console.cloud.google.com/ を開く
2. 上部のプロジェクト選択メニュー → **新しいプロジェクト**（既にあるものを使ってもよい）
3. 左メニュー → **APIとサービス** → **OAuth同意画面**
   - **アプリ名**: `イチカブ`（任意）
   - **ユーザーサポートメール**: 自分のメールアドレス
   - **対象**: **外部**（個人の Google アカウントを使うため）
   - **連絡先メールアドレス**: 自分のメールアドレス
4. 「外部」にするとアプリは**テスト中**になる。**テストユーザーに自分のメールアドレスを追加する**。
   追加しないと同意画面が「アクセスをブロックしました」で止まる
5. 左メニュー → **APIとサービス** → **認証情報** → **＋認証情報を作成** → **OAuthクライアントID**
   - **アプリケーションの種類**: ウェブアプリケーション
   - **名前**: `ichikabu-web`（任意）
   - **承認済みのJavaScript生成元**:
     - `http://localhost:3000`
     - `https://ichikabu.netlify.app`
   - **承認済みのリダイレクトURI**:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://ichikabu.netlify.app/api/auth/callback/google`
6. **クライアントID** と **クライアントシークレット** を控える

**リダイレクトURIは完全一致で照合される。** 末尾のスラッシュの有無も違いになる。

## 2. 手元（`localhost:3000`）に設定する

`server/.env.local` に2行入れる。

```
GOOGLE_CLIENT_ID=<手順1のクライアントID>
GOOGLE_CLIENT_SECRET=<手順1のクライアントシークレット>
```

**開発中も Google の認証を通す。** 配信先だけで使う状態にすると、毎日踏まない経路になり、
壊れたことに配信先で初めて気づく。

### 未設定だと起動時に落ちる

`server/src/auth.ts` は、この2つが無いと例外を投げてサーバーを起動させない。

Better Auth は未設定でも警告を1行出すだけでプロバイダを登録する。その状態のまま
「Google でログイン」を押すと、**本文の無い HTTP 500** が返る。画面には応答コードしか出ず、
設定漏れなのか実装の不具合なのか区別がつかない。起動時に落とすほうが分かる。

## 3. 配信先（Netlify）に設定する

Netlify の **Project configuration > Environment variables** に同じ2つを入れる
（`docs/guides/deploy.md` §2 の表）。

入れ忘れると、デプロイ後に管理UIの「Google でログイン」が 500 を返す。
**そのときはメールアドレスとパスワードでログインできる。** サインイン画面には
両方の入り口が残してある。

## 4. 確認

開発サーバー（`cd server && nvm use && pnpm dev`）を起動して、リポジトリの最上位で実行する。

```bash
curl -s -X POST http://localhost:3000/api/auth/sign-in/social \
  -H "content-type: application/json" \
  -d '{"provider":"google","callbackURL":"/"}'
```

`https://accounts.google.com/o/oauth2/...` から始まり `client_id=` を含むURLが返れば設定できている。

```
{"url":"https://accounts.google.com/o/oauth2/auth?client_id=...","redirect":true}
```

| 返ってくるもの | 原因 |
|---|---|
| `{"code":"PROVIDER_NOT_FOUND"}`・404 | `server/src/auth.ts` に `socialProviders` が無い |
| 本文の無い 500 | `GOOGLE_CLIENT_ID` か `GOOGLE_CLIENT_SECRET` が空（配信先で起きる。手元は起動時に落ちる） |

## 5. 仕組み

`server/src/auth.ts` に3つ書いてある。

| 設定 | 何のため |
|---|---|
| `socialProviders.google` | クライアントIDとシークレットを渡すだけ |
| `databaseHooks.user.create.before` で必ず例外を投げる | **利用者を増やす作成を全部拒む。** 許可していない Google アカウントの利用者がDBに作られないのはこれによる |
| （`accountLinking` は書かない） | 既定が最も厳しい。同じメールアドレスで、Google 側もDB側もメール確認済みのときだけ結びつく |

### なぜ `disableSignUp` ではなく DB のフックなのか

Better Auth 1.6.26 には、プロバイダ側の `disableSignUp: true` が効かない経路がある。

- `/api/auth/callback/google`（同意画面からの戻り）は `provider.options.disableSignUp` を見る → 効く
- `/api/auth/sign-in/social` に ID トークンを直接渡す経路は `provider.disableSignUp` を見る → **効かない**

設定から上がってくるのは前者だけ（`create-context.mjs:103` が `disableImplicitSignUp` しか
コピーしない）。後者の経路は素通りして利用者が作られる。

経路ごとに塞ぐのをやめ、**どの経路も必ず通る `internalAdapter.createOAuthUser` の手前**で
止めている。この関門が効いていることは `server/src/auth.test.ts` の
「許可していない Google アカウントでは利用者が作られない」で確かめられる。
フックの `throw` を消すと、このテストが `intruder@example.com` の作成を検出して失敗する。

### seed だけが利用者を作れる

`server/src/db/seed-user.ts` は、このフックを通らないようテーブルへ直接 `insert` する。
**利用者を作れる唯一の経路がこのスクリプト**という形にしてある。
