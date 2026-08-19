# バックアップ（本番DB）

**週1回、手で `pnpm db:dump` を実行する。** 自動では取られない。

人力で登録したイベントは、消えたら入れ直すしかない（設計書 §14「運用」）。Supabase の無料プランには定期バックアップが無いため、自分で取る。

**取るのはデータだけ。** テーブルの定義は `server/drizzle/` にあり（コミットしている）、戻すときは `pnpm db:migrate` で作る。定義まで入れると、Supabase のプロジェクトへ戻すときに向こうに元からあるものとぶつかって止まる。

## 1. 取り方

```bash
cd server
nvm use
( set -a; . ./.env.deploy.local; set +a; pnpm db:dump )
```

```
接続先: postgres://postgres.<プロジェクトID>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
backups/2026-08-14-aws-0-ap-northeast-1.pooler.supabase.com-postgres.sql を作成しました
DBのサイズ: <いまの大きさ> MB / 500 MB
```

最後の1行の読み方は §4。開発用DBに繋いだときは `DBのサイズ: 9 MB` だけになる（500MB の上限は Supabase にしか無いため）。

`( )` でくくるのは `docs/guides/deploy.md` §1.1 と同じ理由。本番の `DATABASE_URL` をシェルに残さない。

`.env.deploy.local` の作り方は `docs/guides/deploy.md` §3。**Worktree では作られないので、メインcheckout で実行する。**

開発用DBを取るときは、そのまま `pnpm db:dump` でよい（`.env.local` を読む）。

### 置き場所

`server/backups/`。**コミットしない**（`.gitignore`）。リポジトリが Synology Drive の中にあるため、置いた時点で Mac の外にも複製される。

> ⚠️ **ダンプには認証の情報も入る。** `account` テーブルのパスワードのハッシュと Google のトークン、`session` テーブルのセッションのトークンが平文で並ぶ。人に渡さない。

ファイル名に**接続先のホストとデータベース名が入る**。開発用と本番のダンプが同じ形の名前で並ばないようにするため。

```
backups/2026-08-14-localhost-ichikabu.sql                                  ← 開発用
backups/2026-08-14-aws-0-ap-northeast-1.pooler.supabase.com-postgres.sql   ← 本番
```

**古いダンプを消す仕組みは無い。** 上書きにすると、壊れた状態のダンプで前回ぶんを潰す事故が防げない。1回ぶんが約10KBなので、週1回で年0.5MB。困る大きさになってから `find backups -mtime +90 -delete` を足す。

### 取れていないときは止まる

**ファイルができるだけでは足りない。** 接続先が空でも `pg_dump` は成功してファイルを作るため、`pnpm db:dump` は `event` の行が1件以上あることまで確かめる。

```
event の行が1件も無い。<接続URL> が空か、違うDBを指している。取れたものは backups/....sql.part
```

**このとき取れたものは `.part` のまま残る。** 中身を確かめられるようにするためで、`backups/*.sql` には混ざらない。`.env.deploy.local` の `DATABASE_URL` が別のプロジェクトを指していないか確かめる。

`pg_dump` 自体が途中で落ちたときも、書きかけの `.part` が残る。**`.part` は自動では消えない**ので、原因を直したあとに `rm backups/*.part` する。

## 1.5 続けて公表予定を取り込む

**バックアップを取った直後に、同じ回で日本CPI の公表予定を本番へ取り込む。**

```bash
( set -a; . ./.env.deploy.local; set +a; pnpm import:stat )
```

```
公表予定から 15 件を読んだ
登録した: 12 件
  + 消費者物価指数（2026年9月分）
  …
公表日時が変わった: 0 件
非アクティブにした: 0 件
```

- **`pnpm import:stat` の定義は `.env.local`（開発用）を読む形だが、シェルに `DATABASE_URL` があるとそちらが勝つ**（Node の `--env-file` は既にある値を上書きしない。実測）。`pnpm db:seed` と同じ形で、裏返すと **`( )` の中に `.env.deploy.local` を読み込まずに叩くと開発用DBに入る**（`docs/guides/deploy.md` §3 の ⚠️ と同じ落とし穴）
- **決まった間隔での自動実行は入れない**（Issue #107 で討論して決めた。→ `docs/records/specs/2026-08-12-64-import-stat-schedule-design.md` §7）。週1回のこの手順にぶら下げるのが、いま存在する唯一の定期作業だから
- 月1回で足りるものを週1回叩いてよいのは、**変わっていなければ何も書かないから**（`登録した: 0 件` で終わる）
- **止まったときは何も書かれていない。** 「非アクティブにする回が多すぎる」で止まったら、まず公表予定の XML の形が変わって読み落としていることを疑う（`docs/records/specs/2026-08-12-64-import-stat-schedule-design.md` §7）。**本物の中止が2件重なった場合も同じ文で止まる**ため、次の順で見分ける
  1. 止まった文に並んだ対象期を、**取り込みが読んでいる XML そのもの**で1件ずつ数える（`https://www.stat.go.jp/data/cpi/` は出典として表示するページで、公表予定の一覧は載っていない）

     ```bash
     curl -s https://www.stat.go.jp/data/kouhyou/e-stat_cpi.xml \
       | iconv -f UTF-16LE -t UTF-8 | grep -c '2026年9月分'
     ```

     `grep` は XML として解釈しないので、`iconv` で UTF-8 に直してよい（取り込み本体が `iconv` を使えないのは、XML パーサに宣言の食い違いで弾かれるため。→ 取り込みの設計書 §2.1）。全国と東京都区部の両方に同じ対象期があるため、**載っていれば2以上**が返る
  2. **載っていれば読み落とし。** 管理UIでは何もせず、取り込みのコードを直す（`app/stat-schedule.ts` の正規表現）
  3. **どれも載っていなければ本物の中止。** 管理UIでその回を消してから流し直す。**消した行は画面からは戻せない**（監査ログの `previous_values` から戻す手順が 監査ログ 設計書 §5.4 にある）

流したかどうかは、iPhone が見ているのと同じ入口で数えられる。

```bash
curl -s https://ichikabu.netlify.app/api/events \
  | python3 -c "import json,sys; print(len([e for e in json.load(sys.stdin) if e['shortLabel']=='日本CPI']))"
```

CDNに5分載るため、取り込んだ直後は前の数が返る（`docs/records/specs/2026-08-16-118-public-api-cache-design.md`）。

## 2. 戻し方

**表の定義を先に作る。** ダンプにはデータしか入っていない。

```bash
cd server
nvm use

# 1. 戻す先に表を作る（すでに動いているDBなら不要）
DATABASE_URL='<戻す先>' pnpm db:migrate

# 2. データを流し込む
/opt/homebrew/opt/postgresql@18/bin/psql '<戻す先>' -1 -v ON_ERROR_STOP=1 \
  -f backups/2026-08-14-....sql
```

**`-1` と `-v ON_ERROR_STOP=1` を必ず両方付ける。** 片方ずつでは足りない。

| 付けないと | 起きること |
|---|---|
| `-v ON_ERROR_STOP=1` | エラーが出ても最後まで流れて終了コード0を返す。半分だけ入った状態を成功と読む |
| `-1` | 止まりはするが、**そこまでに入った行は残る**。実測: 途中で `duplicate key` になったとき、`user` の3件だけが入った状態で止まった。`-1` を付けると同じ場面で0件に戻る |

**戻す先の表は空にしておく。** 行が残っていると、同じ主キーで入れようとして `duplicate key` で止まる。

**そのダンプを取った時点のコミットで `db:migrate` する。** データだけのダンプは、取ったときの表の形に縛られる。あとから列が増えたり名前が変わったりすると、古いダンプは最新の形の表に入らない。`git log` でバックアップの日付に近いコミットを見て、そこへ切り替えてから `db:migrate` を実行する。

戻したあとに行数を見る。

```bash
/opt/homebrew/opt/postgresql@18/bin/psql '<戻す先>' -Atc 'select count(*) from event'
```

本番へ戻すときは、**Supabase で新しいプロジェクトを作ってそこへ戻す**のが安全。壊れた本番へ直接流すと、失敗したときに戻る先が無くなる。新しいプロジェクトの作り方は `docs/guides/deploy.md` §5、接続URLの選び方は §4。戻し終えてから Netlify の `DATABASE_URL` を差し替える（同 §5「Netlify」）。

> この手順は開発用DB（Docker の PostgreSQL 18）で実測してある。空のDBに `pnpm db:migrate` を当ててからダンプを流し、`event` 40件・`user` 3件が戻り、次に振られるIDも続きから始まることを確認した。**Supabase のプロジェクトへ戻すところは、まだ実際には試していない。**

## 3. `pg_dump` のバージョン

**`pg_dump` はサーバーより新しくないと動かない。** 古いほうで繋ぐと、何も取らずに止まる。

```
pg_dump: error: server version: 18.4; pg_dump version: 14.9 (Homebrew)
pg_dump: error: aborting because of server version mismatch
```

| | バージョン | 測った日 |
|---|---|---|
| 開発用DB（Docker） | 18.4 | 2026-08-14 |
| 本番（Supabase 東京） | **17.6** | 2026-08-14 |
| 使う `pg_dump`（postgresql@18） | 18.3 | 2026-08-14 |

本番のほうが `pg_dump` より古いので通る。測り方は下記。

```bash
cd server
( set -a; . ./.env.deploy.local; set +a; /opt/homebrew/opt/postgresql@18/bin/psql "$DATABASE_URL" -Atc 'show server_version' )
```

このMacの PATH の `pg_dump` は Homebrew の postgresql@14（14.9）で、**開発用DB（18.4）にも本番（17.6）にも届かない**。そのため `server/scripts/dump.ts` は `/opt/homebrew/opt/postgresql@18/bin/pg_dump` を直接指している。

```bash
brew install postgresql@18   # 入っていない場合
```

`/opt/homebrew/opt/postgresql@18` は Homebrew が張り替える別名なので、18.3 → 18.4 の更新でこのパスは変わらない。**PostgreSQL 19 に上げたときは上と同じ mismatch で止まる**ので、そのとき `scripts/dump.ts` の `pgBin` を書き換える。pg_dump も psql もここから取っているので、直すのは1か所でよい。

## 4. 有料プランへ上げる線（Issue #16 で決めた）

Supabase の無料プランは**500MB**。超えると書き込みが止まる。

> **400MB に達したら Supabase を Pro（$25/月）に上げる。**

ダンプの最後の行がこう変わるので、週1で取っていれば必ず目に入る。**逆に言えば、ダンプを取らない週はこの信号が出ない。** Netlify のように向こうから通知は来ない。

```
DBのサイズ: 412 MB / 500 MB
⚠️ 400 MB に達した。Supabase を Pro に上げる（→ docs/guides/backup.md §4）
```

**400 という幅は、見る間隔から出ている。** 週1で見るので、残り100MB あれば「増え方を1回見てから上げる」で間に合う（100MB ÷ 7日 ＝ 1日14MB 増え続けて、ようやく1週間で埋まる）。上げる操作自体は Supabase の画面で5分。

**見張るものは別に作らない。** 毎週必ず走るダンプに相乗りさせれば、増える手間が0になるため。線と表示は `server/src/db/dump.ts` の `dbSizeLine` にあり、動かすと `server/src/db/dump.test.ts` が赤くなる。

### 測っているもの

`pg_database_size(current_database())`。Supabase が Database size の確かめ方として挙げているものと同じで、**500MB を課しているのは Supabase なので、Supabase が数えている数え方で見る。**

**表と索引を足し上げる数え方で代用しないこと。** 開発用DB（event 40件）で両方を測ると、`pg_database_size` が 8,734 kB、public の表と索引の合計が 816 kB で、**10倍ちがう**（2026-08-15 実測）。少ないほうで線を引くと、上限に着いてから気づくことになる。

**開発用DBの数字を本番の代わりにしないこと。** Supabase のプロジェクトには `auth`・`storage` 等のスキーマが最初から入っており、空でも数十MBある。
