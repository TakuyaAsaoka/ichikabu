# バックアップ（本番DB）

**週1回、手で `pnpm db:dump` を実行する。** 自動では取られない。

人力で登録したイベントは、消えたら入れ直すしかない（設計書 §14「運用」）。Supabase の無料プランには定期バックアップが無いため、自分で取る。

## 1. 取り方

```bash
cd server
nvm use
( set -a; . ./.env.deploy.local; set +a; pnpm db:dump )
```

```
接続先: aws-0-ap-northeast-1.pooler.supabase.com:5432
backups/2026-08-14-aws-0-ap-northeast-1.pooler.supabase.com-postgres.sql を作成しました
```

`( )` でくくるのは `docs/guides/deploy.md` §1.1 と同じ理由。本番の `DATABASE_URL` をシェルに残さない。

`.env.deploy.local` の作り方は `docs/guides/deploy.md` §3。**Worktree では作られないので、メインcheckout で実行する。**

開発用DBを取るときは、そのまま `pnpm db:dump` でよい（`.env.local` を読む）。

### 置き場所

`server/backups/`。**コミットしない**（`server/.gitignore`）。リポジトリが Synology Drive の中にあるため、置いた時点で Mac の外にも複製される。

ファイル名に**接続先のホストとデータベース名が入る**。開発用と本番のダンプが同じ形の名前で並ばないようにするため。

```
backups/2026-08-14-localhost-ichikabu.sql                                  ← 開発用
backups/2026-08-14-aws-0-ap-northeast-1.pooler.supabase.com-postgres.sql   ← 本番
```

**古いダンプを消す仕組みは無い。** 上書きにすると、壊れた状態のダンプで前回ぶんを潰す事故が防げない。1回ぶんが約30KBなので、週1回で年1.5MB。困る大きさになってから `find backups -mtime +90 -delete` を足す。

### 取れていないときは止まる

**ファイルができるだけでは足りない。** 接続先が空でも `pg_dump` は成功してファイルを作るため、`pnpm db:dump` は `event` の行が1件以上あることまで確かめる。

```
Error: event の行が1件も無い。<ホスト> が空か、違うDBを指している。取れたものは backups/....sql.part
```

**このとき取れたものは `.part` のまま残る。** 中身を確かめられるようにするためで、`backups/*.sql` には混ざらない。`.env.deploy.local` の `DATABASE_URL` が別のプロジェクトを指していないか確かめる。

## 2. 戻し方

**戻す先は空のデータベースにする。** 中身があるDBに流すと `already exists` で止まる（テーブルを作る文から入っているため）。

```bash
cd server
/opt/homebrew/opt/postgresql@18/bin/psql "<戻す先の DATABASE_URL>" -v ON_ERROR_STOP=1 \
  -f backups/2026-08-14-....sql
```

`-v ON_ERROR_STOP=1` を必ず付ける。付けないと**エラーが出ても最後まで流れて終了コード0を返す**ので、半分だけ入った状態を成功と読んでしまう。

戻したあとに行数を見る。

```bash
/opt/homebrew/opt/postgresql@18/bin/psql "<戻す先>" -Atc 'select count(*) from event'
```

本番へ戻すときは、**Supabase のダッシュボードで新しいプロジェクトを作ってそこへ戻す**のが安全。壊れた本番へ直接流すと、失敗したときに戻る先が無くなる。戻し終えてから Netlify の `DATABASE_URL` を差し替える（`docs/guides/deploy.md` §2）。

ダンプは `--no-owner --no-privileges` で取ってある。Supabase にしか無いロールへの `GRANT` が入っていると、別のDBへ戻すときにそこで止まるため。

## 3. `pg_dump` のバージョン

**`pg_dump` はサーバーより新しくないと動かない。** 古いほうで繋ぐと、何も取らずに止まる。

```
pg_dump: error: server version: 18.4; pg_dump version: 14.9 (Homebrew)
pg_dump: error: aborting because of server version mismatch
```

このMacの PATH の `pg_dump` は Homebrew の postgresql@14（14.9）で、**開発用DB（18）にも本番にも届かない**。そのため `server/scripts/dump.ts` は `/opt/homebrew/opt/postgresql@18/bin/pg_dump` を直接指している。

```bash
brew install postgresql@18   # 入っていない場合
```

`/opt/homebrew/opt/postgresql@18` は Homebrew が張り替える別名なので、18.3 → 18.4 の更新でこのパスは変わらない。**PostgreSQL 19 に上げたときは上と同じ mismatch で止まる**ので、そのとき `scripts/dump.ts` の `18` を書き換える。
