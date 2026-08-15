/**
 * ダンプの出力先の名前。接続先のホストとデータベース名を入れる。
 *
 * 名前に入れるのは、取り違えに後から気づけるようにするため。`--env-file` は
 * シェルにすでにある値を上書きしないので、本番のつもりで `.env.deploy.local` の
 * 読み込みを忘れると、開発用DBを黙ってダンプする（→ docs/guides/backup.md）。
 * 時刻だけの名前だと、backups/ を開いたときにどれが本番か見分けられない。
 */
export function dumpFileName(databaseUrl: string, date: Date): string {
  const { hostname, pathname } = new URL(databaseUrl);
  // pathname は先頭に "/" が付く。そのまま名前に入れるとディレクトリ扱いになる
  const database = pathname.slice(1);
  // sv-SE の日付表記は YYYY-MM-DD。時間帯を書かずに UTC で切ると、
  // 朝に取ったバックアップに前日の日付が付く
  const day = date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  return `${day}-${hostname}-${database}.sql`;
}

/**
 * pg_dump に渡す接続先と、そこから外したパスワード。
 *
 * パスワードを引数に載せると実行中は `ps` に見え、pg_dump が失敗したときに
 * Node が出すエラー文（実行したコマンドの全文が入る）にも残る。`PGPASSWORD` で
 * 渡すために分ける。
 *
 * **URL の中の記号は `%40` のような形で書かれているので、戻してから渡す。**
 * URL オブジェクトは戻さない。Supabase が作るパスワードは記号を含むため、
 * 戻さないと本番だけ認証に落ちる。
 */
export function splitPassword(databaseUrl: string): {
  url: string;
  password: string;
} {
  const conn = new URL(databaseUrl);
  const password = decodeURIComponent(conn.password);
  conn.password = "";

  return { url: conn.toString(), password };
}

/** Supabase の無料プランの上限。ここを超えると書き込みが止まる */
const supabaseFreeLimitMb = 500;

/** Supabase を Pro に上げる線。なぜここに引いたかは docs/guides/backup.md §4 */
const upgradeThresholdMb = 400;

/**
 * ダンプのついでに出す、DBのサイズの行。
 *
 * **上限を出すのは Supabase に繋いだときだけ。** 開発用DBに500MBの線は無く、
 * 出すと嘘になる。
 */
export function dbSizeLine(bytes: number, databaseUrl: string): string {
  // psql が数値以外を返したとき。0扱いにすると「まだ余裕がある」と読めてしまう
  if (!Number.isFinite(bytes)) {
    return "DBのサイズ: 取れなかった";
  }

  const mb = Math.round(bytes / 1024 / 1024);

  // 本番は pooler の `...pooler.supabase.com`、直つなぎは `db.<ID>.supabase.co`。
  // 末尾が2通りあるので、ドットまでで見る
  if (!new URL(databaseUrl).hostname.includes("supabase.")) {
    return `DBのサイズ: ${mb} MB`;
  }

  const line = `DBのサイズ: ${mb} MB / ${supabaseFreeLimitMb} MB`;

  return mb < upgradeThresholdMb
    ? line
    : `${line}\n⚠️ ${upgradeThresholdMb} MB に達した。Supabase を Pro に上げる（→ docs/guides/backup.md §4）`;
}

/** event の COPY 行。この直後にデータ行が続く。0件だと次の行がすぐ `\.` になる */
const eventCopy = /^COPY public\.event \(.*\) FROM stdin;\n/m;

/**
 * ダンプに event の行が1件以上入っているか。
 *
 * **ファイルができただけでは足りない。** 空のDBに繋いでも pg_dump は成功して
 * ファイルを作り、`COPY public.event ... FROM stdin;` の行も出る。そのため
 * `grep -c '^COPY public.event '` は0行のダンプでも 1 を返す（実測）。
 */
export function hasEventRows(dump: string): boolean {
  const rows = dump.split(eventCopy)[1];

  return rows !== undefined && !rows.startsWith("\\.");
}
